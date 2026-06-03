use crate::bot::Bot;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// Run the Bot in daemon mode: read JSON commands from stdin, write JSON responses to stdout.
pub async fn run(bot: Bot) -> Result<(), anyhow::Error> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();
    let mut stdout = stdout;

    tracing::info!("Bot daemon ready. Waiting for commands on stdin...");

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err = serde_json::json!({
                    "id": null,
                    "ok": false,
                    "error": format!("Invalid JSON: {e}")
                });
                let _ = stdout.write_all(format!("{}\n", serde_json::to_string(&err)?).as_bytes()).await;
                let _ = stdout.flush().await;
                continue;
            }
        };

        let id = request.get("id").cloned();
        let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or(Value::Null);

        let response = handle_method(&bot, method, params).await;

        let mut resp = match response {
            Ok(result) => serde_json::json!({ "id": id, "ok": true, "result": result }),
            Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e.to_string() }),
        };

        // Ensure id is present
        if id.is_some() {
            // already set above
        } else {
            resp["id"] = Value::Null;
        }

        let output = serde_json::to_string(&resp)?;
        stdout.write_all(output.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }

    tracing::info!("Stdin closed, shutting down.");
    Ok(())
}

async fn handle_method(bot: &Bot, method: &str, params: Value) -> Result<Value, anyhow::Error> {
    match method {
        "ping" => Ok(serde_json::json!({ "pong": true, "time": chrono::Utc::now().timestamp_millis() })),

        "register_user" => {
            let pid = get_string(&params, "platform_user_id")?;
            let creds = bot.register_user(&pid).await?;
            Ok(serde_json::to_value(creds)?)
        }

        "get_user_credentials" => {
            let pid = get_string(&params, "platform_user_id")?;
            let creds = bot.get_user_credentials(&pid).await?;
            Ok(serde_json::to_value(creds)?)
        }

        "reset_user_password" => {
            let pid = get_string(&params, "platform_user_id")?;
            let result = bot.reset_user_password(&pid).await?;
            Ok(result)
        }

        "create_room" => {
            let buyer = get_string(&params, "buyer_pid")?;
            let seller = get_string(&params, "seller_pid")?;
            let title = get_string(&params, "title")?;
            let topic = params.get("topic").and_then(|v| v.as_str());
            let room = bot.create_room(&buyer, &seller, &title, topic).await?;
            Ok(serde_json::to_value(room)?)
        }

        "get_room" => {
            let buyer = get_string(&params, "buyer_pid")?;
            let seller = get_string(&params, "seller_pid")?;
            let room = bot.get_room(&buyer, &seller)?;
            Ok(serde_json::to_value(room)?)
        }

        "close_room" => {
            let room_id = get_string(&params, "matrix_room_id")?;
            bot.close_room(&room_id).await?;
            Ok(serde_json::json!({ "ok": true }))
        }

        "list_rooms" => {
            let rooms = bot.list_rooms()?;
            Ok(serde_json::to_value(rooms)?)
        }

        "list_users" => {
            let users = bot.list_users()?;
            Ok(serde_json::to_value(users)?)
        }

        "shutdown" => {
            tracing::info!("Shutdown requested");
            std::process::exit(0);
        }

        _ => Err(anyhow::anyhow!("Unknown method: {method}")),
    }
}

fn get_string(params: &Value, key: &str) -> Result<String, anyhow::Error> {
    params
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("Missing required parameter: {key}"))
}
