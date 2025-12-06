#!/usr/bin/env python3
"""
StockSpot Setup Script
Automates the initial setup and configuration process
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def print_banner():
    """Print setup banner"""
    print("=" * 60)
    print("🚀 StockSpot Setup Script")
    print("=" * 60)
    print("Setting up your autonomous affiliate marketing system...\n")

def check_python_version():
    """Check if Python version is compatible"""
    print("📋 Checking Python version...")
    if sys.version_info < (3, 8):
        print("❌ Python 3.8 or higher is required!")
        print(f"Current version: {sys.version}")
        sys.exit(1)
    print(f"✅ Python {sys.version_info.major}.{sys.version_info.minor} is compatible\n")

def check_node_version():
    """Check if Node.js is installed for TailwindCSS"""
    print("📋 Checking Node.js installation...")
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js {result.stdout.strip()} found")
            return True
        else:
            print("⚠️  Node.js not found - TailwindCSS features will be limited")
            return False
    except FileNotFoundError:
        print("⚠️  Node.js not found - TailwindCSS features will be limited")
        return False

def create_virtual_environment():
    """Create and activate virtual environment"""
    print("\n🔧 Setting up virtual environment...")
    
    venv_path = Path("venv")
    if venv_path.exists():
        print("✅ Virtual environment already exists")
        return
    
    try:
        subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)
        print("✅ Virtual environment created")
    except subprocess.CalledProcessError:
        print("❌ Failed to create virtual environment")
        sys.exit(1)

def install_python_dependencies():
    """Install Python dependencies"""
    print("\n📦 Installing Python dependencies...")
    
    # Determine the correct pip path
    if os.name == 'nt':  # Windows
        pip_path = os.path.join('venv', 'Scripts', 'pip')
    else:  # Unix/Linux/Mac
        pip_path = os.path.join('venv', 'bin', 'pip')
    
    try:
        subprocess.run([pip_path, 'install', '-r', 'requirements.txt'], check=True)
        print("✅ Python dependencies installed")
    except subprocess.CalledProcessError:
        print("❌ Failed to install Python dependencies")
        print("Try running manually: pip install -r requirements.txt")

def setup_environment_file():
    """Setup environment configuration file"""
    print("\n⚙️  Setting up environment configuration...")
    
    env_example = Path('.env.example')
    env_file = Path('.env')
    
    if env_file.exists():
        print("✅ .env file already exists")
        return
    
    if env_example.exists():
        shutil.copy(env_example, env_file)
        print("✅ Created .env file from template")
        print("⚠️  Don't forget to fill in your API keys in the .env file!")
    else:
        print("⚠️  .env.example not found - you'll need to create .env manually")

def setup_tailwindcss(has_node):
    """Setup TailwindCSS if Node.js is available"""
    if not has_node:
        print("\n⚠️  Skipping TailwindCSS setup (Node.js not available)")
        return
    
    print("\n🎨 Setting up TailwindCSS...")
    
    try:
        # Install TailwindCSS and forms plugin
        subprocess.run(['npm', 'install', '-g', 'tailwindcss'], check=True)
        subprocess.run(['npm', 'install', '@tailwindcss/forms'], check=True)
        print("✅ TailwindCSS installed")
        
        # Build CSS
        static_dir = Path('static')
        static_dir.mkdir(exist_ok=True)
        
        dist_dir = static_dir / 'dist'
        dist_dir.mkdir(exist_ok=True)
        
        subprocess.run([
            'tailwindcss', 
            '-i', 'static/style.css', 
            '-o', 'static/dist/style.css',
            '--minify'
        ], check=True)
        print("✅ CSS compiled")
        
    except subprocess.CalledProcessError:
        print("⚠️  TailwindCSS setup failed - you can set it up manually later")

def create_data_directories():
    """Create necessary data directories"""
    print("\n📁 Creating data directories...")
    
    directories = [
        'data',
        'data/deals',
        'data/posts',
        'data/logs',
        'static/dist'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("✅ Data directories created")

def run_initial_test():
    """Run a basic test to ensure setup is working"""
    print("\n🧪 Running initial system test...")
    
    try:
        # Determine the correct python path
        if os.name == 'nt':  # Windows
            python_path = os.path.join('venv', 'Scripts', 'python')
        else:  # Unix/Linux/Mac
            python_path = os.path.join('venv', 'bin', 'python')
        
        # Test import of main modules
        test_code = """
import sys
sys.path.append('app')
try:
    from deal_engine import DealEngine
    from affiliate_link_engine import AffiliateLinkEngine
    from caption_engine import CaptionEngine
    from posting_engine import PostingEngine
    from website_updater import WebsiteUpdater
    print("✅ All modules imported successfully")
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)
"""
        
        result = subprocess.run([python_path, '-c', test_code], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            print(result.stdout.strip())
        else:
            print("⚠️  Module import test failed - check dependencies")
            print(result.stderr)
            
    except Exception as e:
        print(f"⚠️  Test failed: {e}")

def print_next_steps():
    """Print next steps for the user"""
    print("\n" + "=" * 60)
    print("🎉 Setup Complete!")
    print("=" * 60)
    print("\n📋 Next Steps:")
    print("1. Edit the .env file with your API keys:")
    print("   - Affiliate program credentials")
    print("   - Social media API tokens") 
    print("   - URL shortening service keys")
    print()
    print("2. Review and adjust config.yaml settings")
    print()
    print("3. Start the dashboard:")
    
    if os.name == 'nt':  # Windows
        print("   venv\\Scripts\\activate")
    else:  # Unix/Linux/Mac  
        print("   source venv/bin/activate")
    
    print("   python app/dashboard.py")
    print()
    print("4. Access the dashboard at http://localhost:5000")
    print()
    print("📚 Documentation:")
    print("   - README.md - Complete setup and usage guide")
    print("   - .env.example - Environment variable reference")
    print("   - config.yaml - System configuration options")
    print()
    print("🆘 Need Help?")
    print("   - Check the troubleshooting section in README.md")
    print("   - Verify all API keys are correctly configured")
    print("   - Test individual components before full system run")
    print()
    print("🚀 Happy affiliate marketing!")

def main():
    """Main setup function"""
    print_banner()
    
    # Check prerequisites
    check_python_version()
    has_node = check_node_version()
    
    # Setup process
    create_virtual_environment()
    install_python_dependencies()
    setup_environment_file()
    setup_tailwindcss(has_node)
    create_data_directories()
    run_initial_test()
    
    # Completion
    print_next_steps()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Setup failed with error: {e}")
        sys.exit(1)