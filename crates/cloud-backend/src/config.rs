use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize, Clone)]
pub struct Config {
    pub matrix: MatrixConfig,
    #[serde(default)]
    pub database: DatabaseConfig,
}

#[derive(Deserialize, Clone)]
pub struct MatrixConfig {
    pub homeserver_url: String,
    pub bot_username: String,
    pub bot_password: String,
}

#[derive(Deserialize, Clone, Default)]
pub struct DatabaseConfig {
    #[serde(default = "default_db_path")]
    pub path: String,
}

fn default_db_path() -> String {
    "./data/bot.db".to_string()
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, anyhow::Error> {
        let content = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }
}
