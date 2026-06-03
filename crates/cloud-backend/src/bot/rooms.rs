use crate::bot::Bot;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use serde::Serialize;

#[derive(Serialize)]
pub struct RoomInfo {
    pub matrix_room_id: String,
}

impl Bot {
    /// Create a Matrix room for buyer and seller, invite both, return room ID.
    /// If a room already exists for this buyer+seller pair, return it.
    pub async fn create_room(
        &self,
        buyer_pid: &str,
        seller_pid: &str,
        title: &str,
        topic: Option<&str>,
    ) -> Result<RoomInfo, anyhow::Error> {
        // Check if room already exists
        if let Some(existing) = self.db.get_room_by_buyer_seller(buyer_pid, seller_pid)? {
            tracing::info!("Room already exists for {buyer_pid}+{seller_pid}: {existing}");
            return Ok(RoomInfo { matrix_room_id: existing });
        }

        // Look up Matrix user IDs
        let buyer_matrix_id = self.db
            .get_user_matrix_id(buyer_pid)?
            .ok_or_else(|| anyhow::anyhow!("Buyer {buyer_pid} not registered"))?;
        let seller_matrix_id = self.db
            .get_user_matrix_id(seller_pid)?
            .ok_or_else(|| anyhow::anyhow!("Seller {seller_pid} not registered"))?;

        // Create room (defaults to private visibility)
        let mut request = matrix_sdk::ruma::api::client::room::create_room::v3::Request::new();
        request.name = Some(title.to_string());
        if let Some(t) = topic {
            request.topic = Some(t.to_string());
        }
        request.is_direct = true;

        let room = self.matrix_client.create_room(request).await?;
        let room_id = room.room_id().to_string();

        tracing::info!("Created room {room_id}: \"{title}\"");

        // Invite buyer
        let buyer_id: matrix_sdk::ruma::OwnedUserId = buyer_matrix_id.clone().try_into()?;
        room.invite_user_by_id(&buyer_id).await?;
        tracing::info!("Invited buyer {buyer_matrix_id}");

        // Invite seller
        let seller_id: matrix_sdk::ruma::OwnedUserId = seller_matrix_id.clone().try_into()?;
        room.invite_user_by_id(&seller_id).await?;
        tracing::info!("Invited seller {seller_matrix_id}");

        // Send welcome message
        let content = RoomMessageEventContent::text_plain(
            format!("聊天室已创建：{title}\n请在此商议交易事项。")
        );
        room.send(content).await?;

        // Store mapping
        self.db.insert_room_mapping(&room_id, buyer_pid, seller_pid, title, topic)?;

        Ok(RoomInfo { matrix_room_id: room_id })
    }

    /// Look up a room by buyer and seller platform IDs.
    pub fn get_room(&self, buyer_pid: &str, seller_pid: &str) -> Result<Option<RoomInfo>, anyhow::Error> {
        let result = self.db.get_room_by_buyer_seller(buyer_pid, seller_pid)?;
        Ok(result.map(|matrix_room_id| RoomInfo { matrix_room_id }))
    }

    /// Close (archive) a room.
    pub async fn close_room(&self, matrix_room_id: &str) -> Result<(), anyhow::Error> {
        let room_id: matrix_sdk::ruma::OwnedRoomId = matrix_room_id.try_into()?;
        if let Some(room) = self.matrix_client.get_room(&room_id) {
            let content = RoomMessageEventContent::text_plain(
                "交易已完成，聊天室已关闭。如有新交易请重新发起。"
            );
            room.send(content).await?;
        }

        self.db.close_room(matrix_room_id)?;
        tracing::info!("Closed room {matrix_room_id}");
        Ok(())
    }

    /// List all room mappings.
    pub fn list_rooms(&self) -> Result<Vec<crate::db::RoomRow>, anyhow::Error> {
        Ok(self.db.list_rooms()?)
    }

    /// List all user mappings.
    pub fn list_users(&self) -> Result<Vec<crate::db::UserRow>, anyhow::Error> {
        Ok(self.db.list_users()?)
    }
}
