use rusqlite::{Connection, Result as SqlResult, params};
use serde::Serialize;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &str) -> SqlResult<Self> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Mutex::new(Connection::open(path)?);
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqlResult<()> {
        let c = self.conn.lock().unwrap();
        c.execute_batch(
            "CREATE TABLE IF NOT EXISTS user_mappings (
                platform_user_id TEXT PRIMARY KEY,
                matrix_user_id   TEXT NOT NULL UNIQUE,
                created_at       INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS room_mappings (
                matrix_room_id TEXT PRIMARY KEY,
                buyer_pid      TEXT NOT NULL,
                seller_pid     TEXT NOT NULL,
                title          TEXT NOT NULL,
                topic          TEXT,
                status         TEXT DEFAULT 'active',
                created_at     INTEGER NOT NULL
            );"
        )?;
        Ok(())
    }

    // ========== User Mappings ==========

    pub fn get_user_matrix_id(&self, platform_user_id: &str) -> SqlResult<Option<String>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT matrix_user_id FROM user_mappings WHERE platform_user_id = ?1"
        )?;
        Ok(stmt.query_row([platform_user_id], |row| row.get(0)).ok())
    }

    pub fn insert_user_mapping(&self, platform_user_id: &str, matrix_user_id: &str) -> SqlResult<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT OR REPLACE INTO user_mappings (platform_user_id, matrix_user_id, created_at)
             VALUES (?1, ?2, ?3)",
            params![platform_user_id, matrix_user_id, unix_now()],
        )?;
        Ok(())
    }

    pub fn get_platform_id_by_matrix(&self, matrix_user_id: &str) -> SqlResult<Option<String>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT platform_user_id FROM user_mappings WHERE matrix_user_id = ?1"
        )?;
        Ok(stmt.query_row([matrix_user_id], |row| row.get(0)).ok())
    }

    // ========== Room Mappings ==========

    pub fn get_room_by_buyer_seller(&self, buyer_pid: &str, seller_pid: &str) -> SqlResult<Option<String>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT matrix_room_id FROM room_mappings
             WHERE buyer_pid = ?1 AND seller_pid = ?2 AND status = 'active'
             LIMIT 1"
        )?;
        Ok(stmt.query_row(params![buyer_pid, seller_pid], |row| row.get(0)).ok())
    }

    pub fn insert_room_mapping(
        &self, matrix_room_id: &str, buyer_pid: &str, seller_pid: &str,
        title: &str, topic: Option<&str>,
    ) -> SqlResult<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO room_mappings (matrix_room_id, buyer_pid, seller_pid, title, topic, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
            params![matrix_room_id, buyer_pid, seller_pid, title, topic, unix_now()],
        )?;
        Ok(())
    }

    pub fn close_room(&self, matrix_room_id: &str) -> SqlResult<()> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "UPDATE room_mappings SET status = 'closed' WHERE matrix_room_id = ?1",
            [matrix_room_id],
        )?;
        Ok(())
    }

    pub fn list_rooms(&self) -> SqlResult<Vec<RoomRow>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT matrix_room_id, buyer_pid, seller_pid, title, topic, status
             FROM room_mappings ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(RoomRow {
                matrix_room_id: row.get(0)?,
                buyer_pid: row.get(1)?,
                seller_pid: row.get(2)?,
                title: row.get(3)?,
                topic: row.get(4)?,
                status: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_users(&self) -> SqlResult<Vec<UserRow>> {
        let c = self.conn.lock().unwrap();
        let mut stmt = c.prepare(
            "SELECT platform_user_id, matrix_user_id, created_at
             FROM user_mappings ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(UserRow {
                platform_user_id: row.get(0)?,
                matrix_user_id: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;
        rows.collect()
    }
}

#[derive(Serialize)]
pub struct RoomRow {
    pub matrix_room_id: String,
    pub buyer_pid: String,
    pub seller_pid: String,
    pub title: String,
    pub topic: Option<String>,
    pub status: String,
}

#[derive(Serialize)]
pub struct UserRow {
    pub platform_user_id: String,
    pub matrix_user_id: String,
    pub created_at: i64,
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
