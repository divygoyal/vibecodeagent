-- In-app help & support: single ongoing thread per user, with admin replies
-- distinguished by author_type. (user_id, created_at) ordering IS the thread;
-- no separate ticket model. read_at is set when the OTHER party reads the
-- message: user reading admin replies → marks author_type='admin' rows read;
-- admin opening the inbox thread → marks author_type='user' rows read.
CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    author_type VARCHAR(10) NOT NULL,         -- 'user' | 'admin'
    author_admin_id VARCHAR(64),              -- label of replying admin (nullable when author_type='user')
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_support_messages_user_id ON support_messages(user_id);
CREATE INDEX IF NOT EXISTS ix_support_messages_created_at ON support_messages(created_at);
-- Inbox sort key: cheap lookup of "users with unread user messages, oldest first."
CREATE INDEX IF NOT EXISTS ix_support_messages_unread_user
    ON support_messages(user_id, created_at)
    WHERE author_type = 'user' AND read_at IS NULL;
