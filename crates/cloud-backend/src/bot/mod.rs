use crate::db::Database;
use matrix_sdk::authentication::matrix::MatrixSession;
use matrix_sdk::ruma::OwnedUserId;
use matrix_sdk::{Client, SessionMeta, SessionTokens};

pub mod users;
pub mod rooms;

pub struct Bot {
    pub matrix_client: Client,
    pub homeserver_url: String,
    pub db: Database,
}

impl Bot {
    /// Initialize the bot with explicit parameters (no config file needed).
    pub async fn init(
        homeserver_url: &str,
        bot_username: &str,
        bot_password: &str,
        db_path: &str,
    ) -> Result<Self, anyhow::Error> {
        let db = Database::open(db_path)?;

        let client = Client::builder()
            .homeserver_url(homeserver_url)
            .build()
            .await?;

        let login_response = client
            .matrix_auth()
            .login_username(bot_username, bot_password)
            .initial_device_display_name("cloud-backend-bot")
            .send()
            .await?;

        tracing::info!(
            "Bot logged in as {} (device: {})",
            login_response.user_id,
            login_response.device_id
        );

        client.sync_once(matrix_sdk::config::SyncSettings::default()).await?;

        Ok(Self {
            matrix_client: client,
            homeserver_url: homeserver_url.to_string(),
            db,
        })
    }

    /// Login with an existing access token (for session recovery).
    pub async fn init_with_token(
        homeserver_url: &str,
        access_token: &str,
        user_id: &str,
        device_id: &str,
        db_path: &str,
    ) -> Result<Self, anyhow::Error> {
        let db = Database::open(db_path)?;

        let client = Client::builder()
            .homeserver_url(homeserver_url)
            .build()
            .await?;

        let user_id_owned = <OwnedUserId>::try_from(user_id)?;
        let device_id_owned: matrix_sdk::ruma::OwnedDeviceId = device_id.into();

        let session = MatrixSession {
            meta: SessionMeta { user_id: user_id_owned.clone(), device_id: device_id_owned },
            tokens: SessionTokens {
                access_token: access_token.to_string(),
                refresh_token: None,
            },
        };

        client.restore_session(session).await?;
        tracing::info!("Bot session restored as {}", user_id_owned);

        Ok(Self {
            matrix_client: client,
            homeserver_url: homeserver_url.to_string(),
            db,
        })
    }
}
