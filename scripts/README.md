# Scripts

Utility scripts for validating and running StockSpot locally
before deploying to Render.

## docker-validate.sh
Use on macOS, Linux, WSL, or CI environments.

## docker-validate.ps1
Use on Windows with PowerShell.

Both scripts:
- Build the Docker image locally
- Run StockSpot in observer + dry-run mode
- Mirror Render's production runtime
