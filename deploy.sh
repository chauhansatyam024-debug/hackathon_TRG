#!/bin/bash
echo "Starting deployment to AWS..."
IP="13.127.248.142"
KEY="ss_crawler.pem"

echo "1. Syncing codebase to AWS (excluding build artifacts and hidden files)..."
rsync -avz --exclude '.git' --exclude 'target' --exclude 'node_modules' --exclude '__pycache__' --exclude 'pc-app/out' --exclude 'extracted_docx' -e "ssh -i $KEY -o StrictHostKeyChecking=no" ./ ubuntu@$IP:~/hackathon_TRG/

echo "2. Installing Docker on AWS and starting services..."
ssh -i $KEY -o StrictHostKeyChecking=no ubuntu@$IP << 'REMOTE'
    # Update and install docker if not present
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        sudo apt update
        sudo apt install -y docker.io docker-compose
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker $USER
    fi
    
    # Run the services
    cd ~/hackathon_TRG
    
    # We need to use sudo docker-compose if we just installed it to avoid permission issues without relogging
    echo "Starting docker containers..."
    sudo docker-compose down
    sudo docker-compose up --build -d
REMOTE

echo "Deployment finished!"
