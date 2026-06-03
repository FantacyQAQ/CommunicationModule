mod bot;
mod cli;
mod config;
mod db;

use std::path::PathBuf;
use clap::Parser;

/// Matrix Cloud Backend Bot — manages Matrix users and rooms.
/// Listens on stdin for JSON commands (daemon mode).
#[derive(Parser)]
#[command(name = "cloud-backend")]
struct Args {
    /// Path to config file
    #[arg(short, long, default_value = "cloud-backend-config.toml")]
    config: PathBuf,
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cloud_backend=info".into()),
        )
        .init();

    let args = Args::parse();

    tracing::info!("Loading config from {}", args.config.display());
    let config = config::Config::load(&args.config)?;

    tracing::info!("Connecting to Matrix at {}", config.matrix.homeserver_url);
    let bot = bot::Bot::init(&config).await?;

    // Run daemon: read stdin, write stdout
    cli::run(bot).await?;

    Ok(())
}
