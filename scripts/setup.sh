#!/bin/bash
# =============================================================================
# ClawBot VPS Setup Script
# Domain: agent.divygoyal.in
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}  ClawBot VPS Setup Script${NC}"
echo -e "${GREEN}==================================${NC}"

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Don't run as root. Run as ubuntu user.${NC}"
    exit 1
fi

# Configuration
DOMAIN="agent.divygoyal.in"
APP_DIR="/home/ubuntu/vibecodeagent"
DATA_DIR="/home/ubuntu/clawbot-data"
CERTBOT_DIR="/var/www/certbot"

# Step 1: Update system
echo -e "\n${YELLOW}[1/8] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

# Step 2: Install Docker
echo -e "\n${YELLOW}[2/8] Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed. You may need to logout and login again.${NC}"
else
    echo -e "${GREEN}Docker already installed.${NC}"
fi

# Step 3: Install Docker Compose
echo -e "\n${YELLOW}[3/8] Installing Docker Compose...${NC}"
sudo apt install -y docker-compose-plugin

# Step 4: Install Certbot
echo -e "\n${YELLOW}[4/8] Installing Certbot...${NC}"
sudo apt install -y certbot

# Step 5: Create directories
echo -e "\n${YELLOW}[5/8] Creating directories...${NC}"
mkdir -p "$DATA_DIR"
sudo mkdir -p "$CERTBOT_DIR"

# Step 6: Setup firewall
echo -e "\n${YELLOW}[6/8] Configuring firewall...${NC}"
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (for SSL redirect & ACME)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable

# Step 7: Get SSL certificate
echo -e "\n${YELLOW}[7/8] Obtaining SSL certificate...${NC}"
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "Getting SSL certificate for $DOMAIN..."
    echo "Make sure DNS is pointing to this server!"
    read -p "Enter your email for SSL notifications: " SSL_EMAIL
    
    sudo certbot certonly --standalone \
        -d "$DOMAIN" \
        --email "$SSL_EMAIL" \
        --agree-tos \
        --non-interactive
    
    echo -e "${GREEN}SSL certificate obtained!${NC}"
else
    echo -e "${GREEN}SSL certificate already exists.${NC}"
fi

# Step 8: Setup auto-renewal
echo -e "\n${YELLOW}[8/8] Setting up SSL auto-renewal...${NC}"
# Create renewal hook to restart nginx
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh > /dev/null << 'EOF'
#!/bin/bash
cd /home/ubuntu/vibecodeagent && docker compose restart nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh

# Add cron for certbot renewal
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -

echo -e "\n${GREEN}==================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "1. Create .env file: ${YELLOW}cp env.template .env && nano .env${NC}"
echo -e "2. Fill in all environment variables"
echo -e "3. Start services: ${YELLOW}docker compose up -d${NC}"
echo -e "4. Check status: ${YELLOW}docker compose ps${NC}"
echo ""
echo -e "Your site will be available at: ${GREEN}https://$DOMAIN${NC}"
