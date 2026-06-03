use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// A simple test: returns a greeting string to verify WASM is working.
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello from WASM Matrix Client, {}!", name)
}

// ============================================================
// WasmMatrixClient - stub implementation for Phase 0 smoke test
// Will be replaced with real matrix-sdk integration in Phase 1
// ============================================================

#[wasm_bindgen]
pub struct WasmMatrixClient {
    homeserver_url: String,
    logged_in: bool,
}

#[wasm_bindgen]
impl WasmMatrixClient {
    #[wasm_bindgen(constructor)]
    pub fn new(homeserver_url: &str) -> WasmMatrixClient {
        WasmMatrixClient {
            homeserver_url: homeserver_url.to_string(),
            logged_in: false,
        }
    }

    /// Login with an access token (stub - Phase 1 will implement real login)
    pub async fn login_with_token(&mut self, _token: &str) -> Result<(), JsValue> {
        // TODO: Phase 1 - real matrix-sdk login
        self.logged_in = true;
        Ok(())
    }

    /// Check if client is logged in
    pub fn is_logged_in(&self) -> bool {
        self.logged_in
    }

    /// Logout (stub)
    pub async fn logout(&mut self) -> Result<(), JsValue> {
        self.logged_in = false;
        Ok(())
    }

    /// Register event callback for sync events (stub)
    pub fn set_event_callback(&self, _callback: js_sys::Function) {
        // TODO: Phase 1 - connect to sync loop
    }

    /// Start sync loop (stub)
    pub fn start_sync(&self) {
        // TODO: Phase 1 - real sync
    }

    /// Stop sync loop (stub)
    pub fn stop_sync(&self) {
        // TODO: Phase 1
    }

    /// Get joined rooms (stub)
    pub async fn get_rooms(&self) -> Result<JsValue, JsValue> {
        // Return empty array
        Ok(serde_wasm_bindgen::to_value(&Vec::<RoomInfo>::new())?)
    }

    /// Join a room by ID (stub)
    pub async fn join_room(&self, _room_id: &str) -> Result<(), JsValue> {
        Ok(())
    }

    /// Leave a room by ID (stub)
    pub async fn leave_room(&self, _room_id: &str) -> Result<(), JsValue> {
        Ok(())
    }

    /// Send a text message to a room (stub)
    pub async fn send_message(
        &self,
        _room_id: &str,
        _text: &str,
    ) -> Result<String, JsValue> {
        Ok("stub_event_id".to_string())
    }

    /// Get message history for a room (stub)
    pub async fn get_messages(
        &self,
        _room_id: &str,
        _limit: u32,
        _before: Option<String>,
    ) -> Result<JsValue, JsValue> {
        Ok(serde_wasm_bindgen::to_value(&Vec::<MessageInfo>::new())?)
    }
}

// Data types (exposed to JS via serde-wasm-bindgen)
#[derive(Serialize, Deserialize)]
struct RoomInfo {
    #[serde(rename = "roomId")]
    room_id: String,
    name: String,
    topic: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct MessageInfo {
    #[serde(rename = "eventId")]
    event_id: String,
    sender: String,
    body: String,
    timestamp: u64,
}
