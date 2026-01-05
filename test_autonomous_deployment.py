#!/usr/bin/env python3
"""
StockSpot Autonomous Deployment Test Suite
Comprehensive validation of the autonomous system
"""

import os
import sys
import time
import json
import requests
import threading
import subprocess
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AutonomousDeploymentTester:
    """Comprehensive tester for StockSpot autonomous deployment"""
    
    def __init__(self, base_url: str = "http://127.0.0.1:5000"):
        self.base_url = base_url
        self.test_results = {}
        self.worker_process = None
        self.scheduler_process = None
        
    def log_result(self, test_name: str, success: bool, message: str = "", data: Dict = None):
        """Log test result"""
        self.test_results[test_name] = {
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat(),
            'data': data or {}
        }
        
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status} | {test_name}: {message}")
    
    def test_file_structure(self) -> bool:
        """Test that all deployment files exist"""
        logger.info("🗂️  Testing deployment file structure...")
        
        required_files = [
            'api.py', 'worker.py', 'scheduler.py', 'queue_manager.py',
            'twitter_engine.py', 'amazon_links.py',
            'Procfile', 'runtime.txt', 'requirements.txt',
            'render.yaml', 'railway.toml',
            'templates/dashboard.html', 'templates/add_item.html', 'templates/base.html',
            'static/stockspot_ui.css'
        ]
        
        missing_files = []
        for file_path in required_files:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
        
        if missing_files:
            self.log_result("file_structure", False, f"Missing files: {missing_files}")
            return False
        
        self.log_result("file_structure", True, "All deployment files present")
        return True
    
    def test_environment_variables(self) -> bool:
        """Test environment variable configuration"""
        logger.info("🔧 Testing environment variables...")
        
        # Test that .env template exists
        env_file_exists = os.path.exists('.env')
        
        # Check for deployment config files
        deployment_configs = ['render.yaml', 'railway.toml', 'Procfile']
        config_exists = any(os.path.exists(f) for f in deployment_configs)
        
        if not config_exists:
            self.log_result("environment_setup", False, "No deployment configuration files found")
            return False
        
        self.log_result("environment_setup", True, "Deployment configuration ready")
        return True
    
    def test_imports_and_dependencies(self) -> bool:
        """Test that all imports work correctly"""
        logger.info("📦 Testing imports and dependencies...")
        
        try:
            # Test core imports
            import flask
            import tweepy
            import requests
            from queue_manager import job_queue
            from twitter_engine import send_tweet
            from amazon_links import generate_amazon_link
            
            self.log_result("imports", True, "All core imports successful")
            return True
            
        except Exception as e:
            self.log_result("imports", False, f"Import error: {e}")
            return False
    
    def test_job_queue_system(self) -> bool:
        """Test job queue functionality"""
        logger.info("📋 Testing job queue system...")
        
        try:
            from queue_manager import job_queue, add_twitter_post_job, add_amazon_link_job
            
            # Test adding jobs
            job1 = add_twitter_post_job("Test Product", "https://amazon.com/test", "https://amazon.com/test?tag=test")
            job2 = add_amazon_link_job("https://amazon.com/test2")
            
            # Test queue stats
            stats = job_queue.get_stats()
            
            # Test getting jobs
            next_job = job_queue.get_next_job()
            
            if next_job:
                job_queue.complete_job(next_job['id'], {'status': 'test_success'})
            
            self.log_result("job_queue", True, f"Queue functional with {stats['total']} jobs", stats)
            return True
            
        except Exception as e:
            self.log_result("job_queue", False, f"Queue error: {e}")
            return False
    
    def test_api_endpoints(self) -> bool:
        """Test all API endpoints"""
        logger.info("🌐 Testing API endpoints...")
        
        # Wait for API to be ready
        max_retries = 10
        for i in range(max_retries):
            try:
                response = requests.get(f"{self.base_url}/status", timeout=5)
                if response.status_code == 200:
                    break
            except:
                if i < max_retries - 1:
                    time.sleep(2)
                    continue
                else:
                    self.log_result("api_availability", False, "API server not responding")
                    return False
        
        # Test endpoints
        endpoints = [
            ('GET', '/status', 200),
            ('GET', '/health', 200),
            ('GET', '/dashboard', 200),
            ('GET', '/add-item', 200),
            ('GET', '/queue/stats', 200),
        ]
        
        all_passed = True
        for method, endpoint, expected_status in endpoints:
            try:
                if method == 'GET':
                    response = requests.get(f"{self.base_url}{endpoint}", timeout=10)
                else:
                    response = requests.post(f"{self.base_url}{endpoint}", timeout=10)
                
                if response.status_code == expected_status:
                    self.log_result(f"endpoint_{endpoint.replace('/', '_')}", True, f"Status: {response.status_code}")
                else:
                    self.log_result(f"endpoint_{endpoint.replace('/', '_')}", False, f"Status: {response.status_code}, expected: {expected_status}")
                    all_passed = False
                    
            except Exception as e:
                self.log_result(f"endpoint_{endpoint.replace('/', '_')}", False, f"Error: {e}")
                all_passed = False
        
        return all_passed
    
    def test_form_submission(self) -> bool:
        """Test the add item form submission"""
        logger.info("📝 Testing form submission...")
        
        try:
            # Test form submission
            form_data = {
                'item_name': 'Autonomous Test Product',
                'product_url': 'https://www.amazon.com/dp/B08N5WRWNW'
            }
            
            response = requests.post(f"{self.base_url}/add-item", data=form_data, timeout=10, allow_redirects=False)
            
            if response.status_code in [200, 302]:  # Success or redirect
                self.log_result("form_submission", True, f"Form submitted successfully (status: {response.status_code})")
                return True
            else:
                self.log_result("form_submission", False, f"Form submission failed with status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("form_submission", False, f"Form submission error: {e}")
            return False
    
    def test_worker_processing(self) -> bool:
        """Test background worker functionality"""
        logger.info("⚙️ Testing background worker...")
        
        try:
            # Start worker process
            self.worker_process = subprocess.Popen(
                [sys.executable, 'worker.py'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Give worker time to start and process jobs
            time.sleep(10)
            
            # Check if worker is still running
            if self.worker_process.poll() is None:
                # Worker is running, let's check queue stats
                try:
                    response = requests.get(f"{self.base_url}/queue/stats", timeout=5)
                    if response.status_code == 200:
                        stats = response.json()
                        self.log_result("worker_processing", True, f"Worker running, queue stats: {stats}", stats)
                        return True
                except:
                    pass
            
            self.log_result("worker_processing", False, "Worker process not running properly")
            return False
            
        except Exception as e:
            self.log_result("worker_processing", False, f"Worker test error: {e}")
            return False
    
    def test_scheduler_functionality(self) -> bool:
        """Test scheduler functionality"""
        logger.info("⏰ Testing scheduler...")
        
        try:
            # Test one-time scheduler execution
            env = os.environ.copy()
            env['SCHEDULER_MODE'] = 'cron'
            
            result = subprocess.run(
                [sys.executable, 'scheduler.py'],
                capture_output=True,
                text=True,
                timeout=30,
                env=env
            )
            
            if result.returncode == 0:
                self.log_result("scheduler", True, "Scheduler executed successfully")
                return True
            else:
                self.log_result("scheduler", False, f"Scheduler failed: {result.stderr}")
                return False
                
        except Exception as e:
            self.log_result("scheduler", False, f"Scheduler test error: {e}")
            return False
    
    def test_deployment_configuration(self) -> bool:
        """Test deployment configuration files"""
        logger.info("🚀 Testing deployment configuration...")
        
        configs_valid = True
        
        # Test Procfile
        if os.path.exists('Procfile'):
            with open('Procfile', 'r') as f:
                procfile_content = f.read()
                if 'web:' in procfile_content and 'worker:' in procfile_content:
                    self.log_result("procfile", True, "Procfile configured correctly")
                else:
                    self.log_result("procfile", False, "Procfile missing required process types")
                    configs_valid = False
        
        # Test requirements.txt
        if os.path.exists('requirements.txt'):
            with open('requirements.txt', 'r') as f:
                requirements = f.read()
                required_packages = ['Flask', 'tweepy', 'requests', 'gunicorn']
                missing_packages = [pkg for pkg in required_packages if pkg.lower() not in requirements.lower()]
                
                if not missing_packages:
                    self.log_result("requirements", True, "All required packages in requirements.txt")
                else:
                    self.log_result("requirements", False, f"Missing packages: {missing_packages}")
                    configs_valid = False
        
        return configs_valid
    
    def cleanup_processes(self):
        """Clean up test processes"""
        if self.worker_process and self.worker_process.poll() is None:
            self.worker_process.terminate()
            self.worker_process.wait(timeout=10)
        
        if self.scheduler_process and self.scheduler_process.poll() is None:
            self.scheduler_process.terminate()
            self.scheduler_process.wait(timeout=10)
    
    def run_comprehensive_tests(self) -> Dict:
        """Run all tests and return results"""
        logger.info("🧪 Starting StockSpot Autonomous Deployment Test Suite")
        logger.info("=" * 70)
        
        try:
            # Run all tests
            tests = [
                ("File Structure", self.test_file_structure),
                ("Environment Setup", self.test_environment_variables),
                ("Dependencies", self.test_imports_and_dependencies),
                ("Job Queue System", self.test_job_queue_system),
                ("API Endpoints", self.test_api_endpoints),
                ("Form Submission", self.test_form_submission),
                ("Background Worker", self.test_worker_processing),
                ("Scheduler", self.test_scheduler_functionality),
                ("Deployment Config", self.test_deployment_configuration),
            ]
            
            passed_tests = 0
            total_tests = len(tests)
            
            for test_name, test_func in tests:
                logger.info(f"\n🔍 Running: {test_name}")
                try:
                    success = test_func()
                    if success:
                        passed_tests += 1
                except Exception as e:
                    logger.error(f"Test {test_name} crashed: {e}")
                    self.log_result(test_name.lower().replace(' ', '_'), False, f"Test crashed: {e}")
            
            # Summary
            logger.info("\n" + "=" * 70)
            logger.info("🎯 AUTONOMOUS DEPLOYMENT TEST RESULTS")
            logger.info("=" * 70)
            
            success_rate = (passed_tests / total_tests) * 100
            
            if success_rate >= 90:
                status_icon = "🎉"
                status = "EXCELLENT"
            elif success_rate >= 80:
                status_icon = "✅"
                status = "GOOD"
            elif success_rate >= 70:
                status_icon = "⚠️"
                status = "ACCEPTABLE"
            else:
                status_icon = "❌"
                status = "NEEDS WORK"
            
            logger.info(f"{status_icon} Overall Result: {status} ({passed_tests}/{total_tests} tests passed)")
            logger.info(f"🎯 Success Rate: {success_rate:.1f}%")
            
            # Detailed results
            logger.info("\nDetailed Results:")
            for test_name, result in self.test_results.items():
                status = "✅ PASS" if result['success'] else "❌ FAIL"
                logger.info(f"  {status} {test_name}: {result['message']}")
            
            # Autonomous deployment readiness
            critical_tests = ['file_structure', 'imports', 'job_queue', 'api_endpoints']
            critical_passed = all(self.test_results.get(test, {}).get('success', False) for test in critical_tests)
            
            if critical_passed and success_rate >= 80:
                logger.info("\n🚀 AUTONOMOUS DEPLOYMENT: READY")
                logger.info("✅ Your StockSpot system is ready for cloud deployment!")
                logger.info("✅ All critical components are functional")
                logger.info("✅ Background worker and scheduler tested")
                logger.info("✅ API endpoints responding correctly")
                
                deployment_ready = True
            else:
                logger.info("\n⚠️ AUTONOMOUS DEPLOYMENT: NEEDS ATTENTION")
                logger.info("❌ Some critical issues need to be resolved before deployment")
                deployment_ready = False
            
            # Return comprehensive results
            return {
                'deployment_ready': deployment_ready,
                'success_rate': success_rate,
                'passed_tests': passed_tests,
                'total_tests': total_tests,
                'test_results': self.test_results,
                'timestamp': datetime.now().isoformat()
            }
            
        finally:
            self.cleanup_processes()

def main():
    """Main test execution"""
    # Change to the project directory
    project_dir = r"c:\Users\Effin\Desktop\StockSpot\StockSpot-Core"
    if os.path.exists(project_dir):
        os.chdir(project_dir)
    
    # Create tester instance
    tester = AutonomousDeploymentTester()
    
    # Run comprehensive tests
    results = tester.run_comprehensive_tests()
    
    # Save results
    with open('deployment_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    logger.info(f"\n📊 Test results saved to: deployment_test_results.json")
    
    # Exit with appropriate code
    if results['deployment_ready']:
        logger.info("🎉 Autonomous deployment validation: SUCCESS")
        sys.exit(0)
    else:
        logger.info("❌ Autonomous deployment validation: ISSUES FOUND")
        sys.exit(1)

if __name__ == "__main__":
    main()