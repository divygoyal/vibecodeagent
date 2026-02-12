#!/bin/bash
# =============================================================================
# ClawBot Quick Deploy Script
# Run after setup.sh and creating .env file
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="agent.divygoyal.in"
APP_DIR="/home/ubuntu/vibecodeagent"

cd "$APP_DIR"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  ClawBot Deploy Script${NC}"
echo -e "${GREEN}==================================${NC}"

# Check .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Create it with: cp env.template .env && nano .env"
    exit 1
fi

# Check SSL certificate
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo -e "${YELLOW}SSL certificate not found. Getting one now...${NC}"
    
    # Use initial nginx config (HTTP only)
    echo -e "Using HTTP-only nginx config first..."
    cp nginx/nginx-initial.conf nginx/nginx.conf.bak
    cp nginx/nginx-initial.conf nginx/nginx.conf
    
    # Start services with HTTP only
    echo -e "Starting services..."
    docker compose up -d nginx web admin-api
    
    # Wait for nginx
    sleep 5
    
    # Get SSL certificate
    source .env
    sudo certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --email "${SSL_EMAIL:-admin@$DOMAIN}" \
        --agree-tos \
        --non-interactive
    
    # Restore SSL nginx config
    cp nginx/nginx.conf.bak nginx/nginx.conf 2>/dev/null || true
    
    # Restart nginx with SSL
    docker compose restart nginx
    
    echo -e "${GREEN}SSL certificate obtained and nginx restarted!${NC}"
else
    echo -e "${GREEN}SSL certificate found.${NC}"
fi

# Build and start all services
echo -e "\n${YELLOW}Building and starting services...${NC}"
docker compose build
docker compose up -d

# Wait for services
echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Health check
echo -e "\n${YELLOW}Checking service health...${NC}"
echo -n "Nginx: "
if docker compose ps nginx | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo -n "Web: "
if docker compose ps web | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo -n "Admin API: "
if docker compose ps admin-api | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo -n "Watchdog: "
if docker compose ps watchdog | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
fi

echo -e "\n${GREEN}==================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "Your site is now live at: ${GREEN}https://$DOMAIN${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:    ${YELLOW}docker compose logs -f${NC}"
echo -e "  Check status: ${YELLOW}docker compose ps${NC}"
echo -e "  Restart:      ${YELLOW}docker compose restart${NC}"
echo -e "  Stop:         ${YELLOW}docker compose down${NC}"
