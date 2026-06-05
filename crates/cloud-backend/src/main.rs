mod bot;
mod cli;
mod db;
mod grpc;

use clap::Parser;

/// Matrix Cloud Backend Bot — manages Matrix users and rooms.
#[derive(Parser)]
#[command(name = "cloud-backend")]
struct Args {
    /// Matrix homeserver URL
    #[arg(long, default_value = "http://127.0.0.1:8008")]
    homeserver_url: String,

    /// Bot Matrix username
    #[arg(long, default_value = "chatbot")]
    bot_username: String,

    /// Bot Matrix password (or set BOT_PASSWORD env var)
    #[arg(long, env = "BOT_PASSWORD")]
    bot_password: String,

    /// SQLite database path
    #[arg(long, default_value = "./data/bot.db")]
    db_path: String,

    /// Run mode: "cli" (default) or "grpc"
    #[arg(long, default_value = "cli")]
    mode: String,

    /// gRPC listen address (grpc mode only)
    #[arg(long, default_value = "127.0.0.1:50051")]
    port: String,
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cloud_backend=info".into()),
        )
        .init();

    let args = Args::parse();

    tracing::info!("Connecting to Matrix at {}", args.homeserver_url);
    let bot = bot::Bot::init(
        &args.homeserver_url,
        &args.bot_username,
        &args.bot_password,
        &args.db_path,
    ).await?;

    match args.mode.as_str() {
        "grpc" => {
            let addr: std::net::SocketAddr = args.port.parse()?;
            grpc::run(bot, addr).await?;
        }
        _ => {
            cli::run(bot).await?;
        }
    }

    Ok(())
}
