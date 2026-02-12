"""
Alert Manager
Sends notifications via Telegram (and optionally email)
"""
import asyncio
import logging
from typing import Optional
from datetime import datetime

import httpx

from config import settings

logger = logging.getLogger("alerts")


class AlertManager:
    """
    Manages alerts and notifications
    Sends to:
    - Telegram (primary)
    - Email (optional, for critical alerts)
    """
    
    def __init__(self):
        self.telegram_token = settings.TELEGRAM_ADMIN_BOT_TOKEN
        self.telegram_chat_id = settings.TELEGRAM_ADMIN_CHAT_ID
        
    async def send_telegram(self, message: str) -> bool:
        """Send message via Telegram"""
        if not self.telegram_token or not self.telegram_chat_id:
            logger.warning("Telegram not configured, skipping alert")
            return False
        
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json={
                    "chat_id": self.telegram_chat_id,
                    "text": message,
                    "parse_mode": "HTML"
                })
                
                if response.status_code == 200:
                    logger.info("Telegram alert sent successfully")
                    return True
                else:
                    logger.error(f"Telegram API error: {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to send Telegram alert: {e}")
            return False
    
    async def send_alert(
        self,
        severity: str,
        title: str,
        message: str,
        user_id: Optional[str] = None
    ) -> bool:
        """
        Send an alert notification
        
        Args:
            severity: info, warning, error, critical
            title: Alert title
            message: Alert details
            user_id: Optional user identifier
        """
        # Format severity emoji
        severity_emoji = {
            "info": "ℹ️",
            "warning": "⚠️",
            "error": "❌",
            "critical": "🚨"
        }
        emoji = severity_emoji.get(severity, "📢")
        
        # Format timestamp
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        # Build message
        formatted = f"""
{emoji} <b>{title}</b>

<b>Severity:</b> {severity.upper()}
<b>Time:</b> {timestamp}

{message}
"""
        
        if user_id:
            formatted += f"\n<b>User:</b> {user_id}"
        
        # Send via Telegram
        return await self.send_telegram(formatted)
    
    async def send_daily_summary(self, stats: dict) -> bool:
        """Send daily status summary"""
        message = f"""
📊 <b>Daily ClawBot Summary</b>

<b>Total Users:</b> {stats.get('total_users', 0)}
<b>Active Containers:</b> {stats.get('running_containers', 0)}
<b>Restarts Today:</b> {stats.get('restarts_today', 0)}
<b>Errors Today:</b> {stats.get('errors_today', 0)}

<b>Plan Breakdown:</b>
• Free: {stats.get('free_users', 0)}
• Starter: {stats.get('starter_users', 0)}
• Pro: {stats.get('pro_users', 0)}

<b>System Health:</b> {'✅ Healthy' if stats.get('healthy', True) else '❌ Issues Detected'}
"""
        return await self.send_telegram(message)
    
    async def send_user_notification(
        self,
        user_telegram_chat_id: str,
        user_bot_token: str,
        message: str
    ) -> bool:
        """
        Send notification to a specific user via their bot
        (Used for user-facing alerts like subscription expiry)
        """
        url = f"https://api.telegram.org/bot{user_bot_token}/sendMessage"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json={
                    "chat_id": user_telegram_chat_id,
                    "text": message,
                    "parse_mode": "HTML"
                })
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to send user notification: {e}")
            return False


# Quick test
async def test_alerts():
    """Test alert functionality"""
    manager = AlertManager()
    result = await manager.send_alert(
        severity="info",
        title="Test Alert",
        message="This is a test alert from ClawBot Admin"
    )
    print(f"Alert sent: {result}")


if __name__ == "__main__":
    asyncio.run(test_alerts())
