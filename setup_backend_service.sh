#!/bin/bash

echo "Moving search-tracker-backend.service to /etc/systemd/system/"
sudo mv search-tracker-backend.service /etc/systemd/system/

echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Enabling search-tracker-backend.service..."
sudo systemctl enable search-tracker-backend.service

echo "Starting search-tracker-backend.service..."
sudo systemctl start search-tracker-backend.service

echo "Checking status of search-tracker-backend.service:"
sudo systemctl status search-tracker-backend.service
