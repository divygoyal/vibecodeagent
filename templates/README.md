# ClawBot Templates

These templates are copied to each user's container during provisioning.

## Files

- **SOUL.md** - Agent personality and behavior guidelines
- **IDENTITY.md** - Agent identity (supports mustache templating)
- **openclaw.json** - OpenClaw runtime configuration

## Template Variables

The following variables are replaced during provisioning:

| Variable | Description |
|----------|-------------|
| `{{USER_NAME}}` | GitHub username |
| `{{PLAN}}` | Subscription plan (free/starter/pro) |
| `{{#PRO_FEATURES}}...{{/PRO_FEATURES}}` | Conditional block for pro plan |

## Customization

For Pro users, custom rules can be injected via the Admin API:

```json
{
  "custom_rules": {
    "allow_sudo": false,
    "max_file_size_mb": 10,
    "blocked_commands": ["rm -rf", "format"]
  }
}
```
