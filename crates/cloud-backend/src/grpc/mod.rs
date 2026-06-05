use tonic::{transport::Server, Request, Response, Status};
use std::net::SocketAddr;

use crate::bot::Bot;

pub mod bot_service {
    tonic::include_proto!("bot");
}

use bot_service::{
    bot_service_server::{BotService, BotServiceServer},
    *,
};

pub struct BotGrpcService {
    bot: Bot,
}

#[tonic::async_trait]
impl BotService for BotGrpcService {
    async fn ping(&self, _: Request<PingRequest>) -> Result<Response<PingResponse>, Status> {
        Ok(Response::new(PingResponse {
            pong: true,
            time: chrono::Utc::now().timestamp_millis(),
        }))
    }

    async fn register_user(
        &self,
        req: Request<RegisterUserRequest>,
    ) -> Result<Response<RegisterUserResponse>, Status> {
        let r = req.into_inner();
        let creds = self.bot.register_user(&r.platform_user_id).await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(RegisterUserResponse {
            matrix_user_id: creds.matrix_user_id,
            access_token: creds.access_token,
            device_id: creds.device_id,
        }))
    }

    async fn get_user_credentials(
        &self,
        req: Request<GetUserCredentialsRequest>,
    ) -> Result<Response<GetUserCredentialsResponse>, Status> {
        let r = req.into_inner();
        let creds = self.bot.get_user_credentials(&r.platform_user_id).await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(GetUserCredentialsResponse {
            matrix_user_id: creds.matrix_user_id,
        }))
    }

    async fn create_room(
        &self,
        req: Request<CreateRoomRequest>,
    ) -> Result<Response<CreateRoomResponse>, Status> {
        let r = req.into_inner();
        let room = self.bot.create_room(
            &r.buyer_pid, &r.seller_pid, &r.title, r.topic.as_deref(),
        ).await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(CreateRoomResponse {
            matrix_room_id: room.matrix_room_id,
        }))
    }

    async fn get_room(
        &self,
        req: Request<GetRoomRequest>,
    ) -> Result<Response<GetRoomResponse>, Status> {
        let r = req.into_inner();
        let room = self.bot.get_room(&r.buyer_pid, &r.seller_pid)
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(GetRoomResponse {
            matrix_room_id: room.and_then(|r| Some(r.matrix_room_id)),
        }))
    }

    async fn close_room(
        &self,
        req: Request<CloseRoomRequest>,
    ) -> Result<Response<CloseRoomResponse>, Status> {
        let r = req.into_inner();
        self.bot.close_room(&r.matrix_room_id).await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(CloseRoomResponse {}))
    }

    async fn list_users(
        &self,
        _: Request<ListUsersRequest>,
    ) -> Result<Response<ListUsersResponse>, Status> {
        let users = self.bot.list_users()
            .map_err(|e| Status::internal(e.to_string()))?;
        let entries: Vec<UserEntry> = users.iter().map(|u| UserEntry {
            platform_user_id: u.platform_user_id.clone(),
            matrix_user_id: u.matrix_user_id.clone(),
            created_at: u.created_at,
        }).collect();
        Ok(Response::new(ListUsersResponse { users: entries }))
    }

    async fn list_rooms(
        &self,
        _: Request<ListRoomsRequest>,
    ) -> Result<Response<ListRoomsResponse>, Status> {
        let rooms = self.bot.list_rooms()
            .map_err(|e| Status::internal(e.to_string()))?;
        let entries: Vec<RoomEntry> = rooms.iter().map(|r| RoomEntry {
            matrix_room_id: r.matrix_room_id.clone(),
            buyer_pid: r.buyer_pid.clone(),
            seller_pid: r.seller_pid.clone(),
            title: r.title.clone(),
            topic: r.topic.clone(),
            status: r.status.clone(),
        }).collect();
        Ok(Response::new(ListRoomsResponse { rooms: entries }))
    }
}

pub async fn run(bot: Bot, addr: SocketAddr) -> Result<(), anyhow::Error> {
    let service = BotGrpcService { bot };
    tracing::info!("gRPC server listening on {}", addr);
    Server::builder()
        .add_service(BotServiceServer::new(service))
        .serve(addr)
        .await?;
    Ok(())
}
