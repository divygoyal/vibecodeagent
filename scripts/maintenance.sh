#!/bin/bash
# VibeCode Agent - Maintenance Script
# Run this periodically (via cron) to keep token usage optimized

set -e

USER_DATA_ROOT="/home/ubuntu/vibecode/users"
LOG_FILE="/var/log/vibecode/maintenance.log"
MAX_SESSION_SIZE_KB=500  # Sessions larger than this will be compacted

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Cleanup bloated session files
cleanup_sessions() {
    log "Starting session cleanup..."
    
    for user_dir in "$USER_DATA_ROOT"/*/; do
        user_id=$(basename "$user_dir")
        sessions_dir="$user_dir.openclaw/sessions"
        
        if [ -d "$sessions_dir" ]; then
            # Find and backup large session files
            find "$sessions_dir" -name "*.jsonl" -size +${MAX_SESSION_SIZE_KB}k | while read session_file; do
                log "Backing up bloated session: $session_file"
                mv "$session_file" "${session_file}.bak.$(date +%Y%m%d)"
            done
        fi
    done
    
    log "Session cleanup complete"
}

# Prune old backup files (keep last 7 days)
prune_backups() {
    log "Pruning old backups..."
    
    find "$USER_DATA_ROOT" -name "*.bak.*" -mtime +7 -delete 2>/dev/null || true
    
    log "Backup pruning complete"
}

# Check container health
check_containers() {
    log "Checking container health..."
    
    docker ps --filter "name=vc_agent_" --format "{{.Names}} {{.Status}}" | while read name status; do
        if [[ "$status" == *"unhealthy"* ]] || [[ "$status" == *"Restarting"* ]]; then
            log "WARNING: Container $name is unhealthy: $status"
            # Optionally restart unhealthy containers
            # docker restart "$name"
        fi
    done
    
    log "Container health check complete"
}

# Log token usage summary
log_usage_summary() {
    log "=== Usage Summary ==="
    
    # Count active containers
    active_count=$(docker ps --filter "name=vc_agent_" --format "{{.Names}}" | wc -l)
    log "Active agents: $active_count"
    
    # Total disk usage
    total_size=$(du -sh "$USER_DATA_ROOT" 2>/dev/null | cut -f1 || echo "N/A")
    log "Total data size: $total_size"
    
    log "=== End Summary ==="
}

# Main
main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    
    log "========================================="
    log "VibeCode Maintenance Started"
    log "========================================="
    
    cleanup_sessions
    prune_backups
    check_containers
    log_usage_summary
    
    log "Maintenance complete"
}

main "$@"
