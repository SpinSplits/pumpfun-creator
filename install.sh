#!/bin/bash

echo "🚀 Meme Coin Rug Tool Installer"
echo "==============================="

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if Node.js is installed
echo -e "${BLUE}Checking Node.js installation...${NC}"
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Starting installation..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if ! command -v brew &> /dev/null; then
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "Your operating system is not supported. Please install Node.js manually: https://nodejs.org"
        exit 1
    fi
fi

# Check Node.js version
NODE_VERSION=$(node -v)
echo -e "${GREEN}Node.js Version $NODE_VERSION is installed${NC}"

# Install Dependencies
echo -e "${BLUE}Installing Dependencies...${NC}"
npm install
npm install -D typescript ts-node @types/node

# Create .env file
echo -e "${BLUE}Creating configuration file...${NC}"
if [ ! -f .env ]; then
    cat > .env << EOL
# Configuration
RPC_ENDPOINT="https://api.mainnet-beta.solana.com"
PRIVATE_KEY=""
LOG_LEVEL="info"
EOL
    echo -e "${GREEN}Configuration file .env has been created${NC}"
else
    echo "Configuration file .env already exists"
fi

echo -e "${GREEN}Installation completed!${NC}"
echo ""
echo "🎉 Next steps:"
echo "1. Open the .env file and add your private key"
echo "2. Start the tool with: npm start"
echo ""
echo "Need help? Join our Discord: https://discord.gg/JXgk42xhaH"
