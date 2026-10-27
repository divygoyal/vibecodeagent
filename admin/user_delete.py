"""Delete every row that belongs to a user (DELETE /api/users/{id}).

The privacy policy and /security promise that a deleted account leaves nothing
behind. Tables are listed by how they point at the user:

* USER_TABLES: a ``user_id`` column (users.id).
* PUBLISHER_TABLES: a ``publisher_user_id`` column (the user's inbox).
* ENTRY_TABLES: rows of the user's leaderboard entries (``entry_id``).
* THREAD_TABLES: rows of the user's chat threads (``thread_id``).
* custom_dashboard_versions: revisions of the user's dashboards (``dashboard_id``).

admin/tests/test_user_delete.py fills every table that has a user, entry,
thread or dashboard column and checks that nothing is left, so a new table with
a ``user_id`` column fails the test until it is added here.
"""
from typing import Iterable, List, Optional, Set

from sqlalchemy import text

USER_TABLES = (
    # account + connections
    "oauth_connections", "github_app_installations", "site_repo_links",
    "usage_logs", "container_events", "support_messages",
    # dashboards, shares, embeds
    "custom_dashboards", "shared_dashboards", "embed_tokens", "social_embed_tokens",
    "annotations", "analytics_goal_definitions", "analytics_funnel_definitions",
    # alerts and digests
    "alerts", "weekly_digests",
    # chat
    "chat_threads", "chat_facts", "chat_embeddings", "chat_feedback",
    "chat_thread_state", "chat_telemetry_events",
    # leaderboard + ad slots
    "leaderboard_entries", "ad_slots",
    # MCP (Connect AI); mcp_oauth_clients has no user
    "mcp_tokens", "mcp_auth_codes", "mcp_grants", "mcp_audit",
    # portfolio + site actions
    "site_daily_metrics", "portfolio_range_totals", "portfolio_assets", "site_action_states",
)

PUBLISHER_TABLES = ("leaderboard_inquiries", "ad_slot_requests")

ENTRY_TABLES = (
    "leaderboard_profiles", "leaderboard_daily", "leaderboard_range_stats",
    "leaderboard_inquiries", "leaderboard_audience", "leaderboard_stats_history",
    "ad_slot_requests", "ad_slots",
)

THREAD_TABLES = (
    "chat_messages", "chat_embeddings", "chat_feedback", "chat_thread_state", "chat_telemetry_events",
)


async def _existing_tables(db) -> Optional[Set[str]]:
    """Table names on SQLite (older databases may miss a table); None elsewhere."""
    try:
        rows = await db.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))
        return {r[0] for r in rows}
    except Exception:
        return None


async def _ids(db, sql: str, params: dict) -> List:
    return [r[0] for r in (await db.execute(text(sql), params)).all()]


async def _delete_in(db, table: str, column: str, values: Iterable) -> None:
    values = list(values)
    for i in range(0, len(values), 500):
        chunk = values[i:i + 500]
        names = ", ".join(f":v{j}" for j in range(len(chunk)))
        await db.execute(text(f"DELETE FROM {table} WHERE {column} IN ({names})"), {f"v{j}": v for j, v in enumerate(chunk)})


async def delete_user_rows(db, user_id: int) -> None:
    """Remove every row of ``user_id`` except the users row itself. The caller commits."""
    have = await _existing_tables(db)

    def ok(table: str) -> bool:
        return have is None or table in have

    u = {"u": user_id}
    entry_ids = await _ids(db, "SELECT id FROM leaderboard_entries WHERE user_id = :u", u) if ok("leaderboard_entries") else []
    thread_ids = await _ids(db, "SELECT id FROM chat_threads WHERE user_id = :u", u) if ok("chat_threads") else []
    dashboard_ids = await _ids(db, "SELECT id FROM custom_dashboards WHERE user_id = :u", u) if ok("custom_dashboards") else []

    # Children first, then the rows that point at the user.
    if entry_ids:
        for table in ENTRY_TABLES:
            if ok(table):
                await _delete_in(db, table, "entry_id", entry_ids)
    if thread_ids:
        for table in THREAD_TABLES:
            if ok(table):
                await _delete_in(db, table, "thread_id", thread_ids)
    if dashboard_ids and ok("custom_dashboard_versions"):
        await _delete_in(db, "custom_dashboard_versions", "dashboard_id", dashboard_ids)
    for table in PUBLISHER_TABLES:
        if ok(table):
            await db.execute(text(f"DELETE FROM {table} WHERE publisher_user_id = :u"), u)
    for table in USER_TABLES:
        if ok(table):
            await db.execute(text(f"DELETE FROM {table} WHERE user_id = :u"), u)
