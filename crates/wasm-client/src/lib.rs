use matrix_sdk::{
    authentication::matrix::MatrixSession,
    config::SyncSettings,
    ruma::{
        events::room::message::RoomMessageEventContent,
        OwnedDeviceId, OwnedRoomId, OwnedUserId,
    },
    Client, SessionMeta, SessionTokens,
};
use serde::Serialize;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

/// A simple test: returns a greeting string to verify WASM is working.
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from WASM Matrix Client, {}!", name)
}

// ============================================================
// WasmMatrixClient - real matrix-sdk integration
// ============================================================

#[wasm_bindgen]
pub struct WasmMatrixClient {
    client: RefCell<Option<Client>>,
    homeserver_url: String,
    event_callback: Rc<RefCell<Option<js_sys::Function>>>,
    sync_running: Rc<RefCell<bool>>,
}

#[wasm_bindgen]
impl WasmMatrixClient {
    #[wasm_bindgen(constructor)]
    pub fn new(homeserver_url: &str) -> WasmMatrixClient {
        WasmMatrixClient {
            client: RefCell::new(None),
            homeserver_url: homeserver_url.to_string(),
            event_callback: Rc::new(RefCell::new(None)),
            sync_running: Rc::new(RefCell::new(false)),
        }
    }

    // ==================== Session Management ====================

    /// Login with Matrix credentials obtained from cloud-backend.
    pub async fn login(
        &self,
        access_token: &str,
        user_id: &str,
        device_id: &str,
    ) -> Result<(), JsValue> {
        let client = Client::builder()
            .homeserver_url(&self.homeserver_url)
            .build()
            .await
            .map_err(|e| JsValue::from_str(&format!("Failed to build client: {e}")))?;

        let user_id_owned = <OwnedUserId>::try_from(user_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid user ID: {e}")))?;
        let device_id_owned = <OwnedDeviceId>::try_from(device_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid device ID: {e}")))?;

        let session = MatrixSession {
            meta: SessionMeta {
                user_id: user_id_owned.clone(),
                device_id: device_id_owned,
            },
            tokens: SessionTokens {
                access_token: access_token.to_string(),
                refresh_token: None,
            },
        };

        client.restore_session(session).await
            .map_err(|e| JsValue::from_str(&format!("Login failed: {e}")))?;

        // Verify login by checking whoami
        let whoami = client.whoami().await
            .map_err(|e| JsValue::from_str(&format!("Failed to verify session: {e}")))?;

        if whoami.user_id != user_id_owned {
            return Err(JsValue::from_str("User ID mismatch after login"));
        }

        // Do an initial sync to populate rooms and device info
        web_sys::console::log_1(&JsValue::from_str("Running initial sync..."));
        client.sync_once(SyncSettings::default()).await
            .map_err(|e| JsValue::from_str(&format!("Initial sync failed: {e}")))?;

        web_sys::console::log_1(
            &JsValue::from_str(&format!("Logged in as {user_id}")),
        );

        *self.client.borrow_mut() = Some(client);
        Ok(())
    }

    /// Check if client is logged in and session is valid.
    pub fn is_logged_in(&self) -> bool {
        self.client.borrow().is_some()
    }

    /// Logout and clear session data.
    pub async fn logout(&self) -> Result<(), JsValue> {
        if let Some(client) = self.client.borrow().as_ref() {
            *self.sync_running.borrow_mut() = false;
            let _ = client.matrix_auth().logout().await;
        }
        *self.client.borrow_mut() = None;
        Ok(())
    }

    // ==================== Sync ====================

    /// Register a JS callback for sync events.
    /// The callback receives a JSON string representing each event.
    pub fn set_event_callback(&self, callback: js_sys::Function) {
        *self.event_callback.borrow_mut() = Some(callback);
    }

    /// Start the sync loop. Runs in the background via spawn_local.
    /// Events are delivered to the JS callback registered via set_event_callback.
    pub fn start_sync(&self) {
        let client = match self.client.borrow().as_ref() {
            Some(c) => c.clone(),
            None => {
                web_sys::console::warn_1(&JsValue::from_str("Cannot start sync: not logged in"));
                return;
            }
        };
        let event_callback = self.event_callback.clone();
        let sync_running = self.sync_running.clone();

        *sync_running.borrow_mut() = true;

        wasm_bindgen_futures::spawn_local(async move {
            web_sys::console::log_1(&JsValue::from_str("Sync loop started"));

            while *sync_running.borrow() {
                match client.sync_once(SyncSettings::default()).await {
                    Ok(response) => {
                        // Process room events from joined rooms
                        for (_room_id, room_info) in &response.rooms.joined {
                            for event in &room_info.timeline.events {
                                if let Some(cb) = event_callback.borrow().as_ref() {
                                    let sender = event.sender()
                                        .map(|s| s.to_string())
                                        .unwrap_or_default();
                                    let event_data = serde_json::json!({
                                        "type": "matrix.event",
                                        "sender": sender,
                                    });
                                    let _ = cb.call1(
                                        &JsValue::NULL,
                                        &JsValue::from_str(&event_data.to_string()),
                                    );
                                }
                            }
                        }
                    }
                    Err(e) => {
                        web_sys::console::warn_1(
                            &JsValue::from_str(&format!("Sync error, retrying: {e}")),
                        );
                    }
                }
            }

            web_sys::console::log_1(&JsValue::from_str("Sync loop stopped"));
        });
    }

    /// Stop the sync loop.
    pub fn stop_sync(&self) {
        *self.sync_running.borrow_mut() = false;
    }

    // ==================== Rooms ====================

    /// Get list of joined rooms with basic info.
    pub async fn get_rooms(&self) -> Result<JsValue, JsValue> {
        let client = self.client.borrow();
        let client = client.as_ref().ok_or_else(|| {
            JsValue::from_str("Not logged in")
        })?;

        let mut rooms = Vec::new();
        for room in client.rooms() {
            let name = room.display_name().await.ok()
                .map(|n| n.to_string())
                .unwrap_or_else(|| room.room_id().to_string());

            let info = RoomInfo {
                room_id: room.room_id().to_string(),
                name,
                topic: room.topic(),
            };
            rooms.push(info);
        }

        Ok(serde_wasm_bindgen::to_value(&rooms)?)
    }

    /// Join a room by its Matrix room ID.
    pub async fn join_room(&self, room_id: &str) -> Result<(), JsValue> {
        let client = self.client.borrow();
        let client = client.as_ref().ok_or_else(|| {
            JsValue::from_str("Not logged in")
        })?;

        let room_id = <OwnedRoomId>::try_from(room_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid room ID: {e}")))?;

        let _room = client.join_room_by_id(&room_id).await
            .map_err(|e| JsValue::from_str(&format!("Failed to join room: {e}")))?;

        Ok(())
    }

    /// Leave a room.
    pub async fn leave_room(&self, room_id: &str) -> Result<(), JsValue> {
        let client = self.client.borrow();
        let client = client.as_ref().ok_or_else(|| {
            JsValue::from_str("Not logged in")
        })?;

        let room_id = <OwnedRoomId>::try_from(room_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid room ID: {e}")))?;

        let room = client.get_room(&room_id).ok_or_else(|| {
            JsValue::from_str("Room not found")
        })?;

        room.leave().await
            .map_err(|e| JsValue::from_str(&format!("Failed to leave room: {e}")))?;

        Ok(())
    }

    // ==================== Messages ====================

    /// Send a text message to a room. Returns the event ID.
    pub async fn send_message(&self, room_id: &str, text: &str) -> Result<String, JsValue> {
        let client = self.client.borrow();
        let client = client.as_ref().ok_or_else(|| {
            JsValue::from_str("Not logged in")
        })?;

        let room_id = <OwnedRoomId>::try_from(room_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid room ID: {e}")))?;

        let room = client.get_room(&room_id).ok_or_else(|| {
            JsValue::from_str("Room not found")
        })?;

        let content = RoomMessageEventContent::text_plain(text);
        let response = room.send(content).await
            .map_err(|e| JsValue::from_str(&format!("Failed to send message: {e}")))?;

        Ok(response.response.event_id.to_string())
    }

    /// Get message history for a room (paginated).
    pub async fn get_messages(
        &self,
        room_id: &str,
        _limit: u32,
        _before: Option<String>,
    ) -> Result<JsValue, JsValue> {
        let client = self.client.borrow();
        let client = client.as_ref().ok_or_else(|| {
            JsValue::from_str("Not logged in")
        })?;

        let room_id = <OwnedRoomId>::try_from(room_id)
            .map_err(|e| JsValue::from_str(&format!("Invalid room ID: {e}")))?;

        let _room = client.get_room(&room_id).ok_or_else(|| {
            JsValue::from_str("Room not found")
        })?;

        // TODO: Implement proper message history retrieval using matrix-sdk 0.18 API
        // For now, return empty list - message history will be populated via sync
        let messages: Vec<MessageInfo> = Vec::new();

        Ok(serde_wasm_bindgen::to_value(&messages)?)
    }
}

// ==================== Data Types ====================

#[derive(Serialize)]
pub struct RoomInfo {
    #[serde(rename = "roomId")]
    pub room_id: String,
    pub name: String,
    pub topic: Option<String>,
}

#[derive(Serialize)]
pub struct MessageInfo {
    #[serde(rename = "eventId")]
    pub event_id: String,
    pub sender: String,
    pub body: String,
    pub timestamp: u64,
}
