use crate::bot::Bot;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct UserCredentials {
    pub matrix_user_id: String,
    pub access_token: String,
    pub device_id: String,
}

impl Bot {
    /// Register a new Matrix user for the given platform user.
    /// Uses the normal Matrix registration API (Conduit has allow_registration=true).
    pub async fn register_user(
        &self,
        platform_user_id: &str,
    ) -> Result<UserCredentials, anyhow::Error> {
        // Check if already registered
        if let Some(existing_id) = self.db.get_user_matrix_id(platform_user_id)? {
            tracing::info!("User {platform_user_id} already mapped to {existing_id}");
            return Ok(UserCredentials {
                matrix_user_id: existing_id,
                access_token: String::new(),
                device_id: String::new(),
            });
        }

        let username = format!("u_{}", platform_user_id);
        let password = format!("auto_{}", &Uuid::new_v4().to_string().replace('-', "")[..16]);

        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/_matrix/client/v3/register", self.homeserver_url))
            .json(&serde_json::json!({
                "username": username,
                "password": password,
                "auth": {"type": "m.login.dummy"},
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Registration failed: {body}"));
        }

        let data: serde_json::Value = resp.json().await?;
        let matrix_user_id = data["user_id"].as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing user_id in registration response"))?
            .to_string();
        let access_token = data["access_token"].as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing access_token in registration response"))?
            .to_string();
        let device_id = data["device_id"].as_str()
            .unwrap_or("bot-device")
            .to_string();

        // Store mapping
        self.db.insert_user_mapping(platform_user_id, &matrix_user_id)?;

        tracing::info!(
            "Registered user {platform_user_id} -> {matrix_user_id}"
        );

        Ok(UserCredentials { matrix_user_id, access_token, device_id })
    }

    /// Get the Matrix user ID for a platform user (no fresh token).
    /// Token management is handled by the frontend WASM client via IndexedDB.
    pub async fn get_user_credentials(
        &self,
        platform_user_id: &str,
    ) -> Result<UserCredentials, anyhow::Error> {
        let matrix_user_id = self.db
            .get_user_matrix_id(platform_user_id)?
            .ok_or_else(|| anyhow::anyhow!("User {platform_user_id} not registered"))?;

        Ok(UserCredentials {
            matrix_user_id,
            access_token: String::new(),  // token managed by frontend
            device_id: String::new(),
        })
    }

    /// Reset user password (for credential recovery).
    pub async fn reset_user_password(
        &self,
        platform_user_id: &str,
    ) -> Result<serde_json::Value, anyhow::Error> {
        // Simply re-register to get fresh credentials
        let creds = self.get_user_credentials(platform_user_id).await?;
        Ok(serde_json::to_value(creds)?)
    }
}
