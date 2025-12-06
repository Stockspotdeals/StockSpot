#!/usr/bin/env python3
"""
StockSpot Project Cleanup Script
Removes dead imports, fixes import paths, and ensures VS Code safety
"""

import os
import sys
import re
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProjectCleanup:
    def __init__(self, project_root):
        self.project_root = project_root
        self.issues_found = []
        self.fixes_applied = []
        
    def scan_python_files(self):
        """Find all Python files in the project"""
        python_files = []
        
        for root, dirs, files in os.walk(self.project_root):
            # Skip common ignored directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['__pycache__', 'node_modules', 'logs']]
            
            for file in files:
                if file.endswith('.py'):
                    python_files.append(os.path.join(root, file))
        
        return python_files
    
    def analyze_imports(self, filepath):
        """Analyze imports in a Python file"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            logger.error(f"Could not read {filepath}: {e}")
            return None
        
        lines = content.split('\n')
        imports = []
        issues = []
        
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            
            # Check for import statements
            if re.match(r'^(import|from)', stripped):
                imports.append({
                    'line_num': i,
                    'content': stripped,
                    'raw_line': line
                })
                
                # Check for problematic patterns
                if 'app.' in stripped or 'affiliate_link_engine' in stripped:
                    issues.append({
                        'type': 'old_import',
                        'line_num': i,
                        'content': stripped,
                        'message': 'Uses old import path'
                    })
                
                if re.search(r'import.*\*', stripped):
                    issues.append({
                        'type': 'wildcard_import',
                        'line_num': i, 
                        'content': stripped,
                        'message': 'Wildcard import can cause issues'
                    })
        
        return {
            'imports': imports,
            'issues': issues,
            'content': content
        }
    
    def suggest_import_fixes(self, analysis):
        """Suggest fixes for import issues"""
        if not analysis:
            return []
        
        suggestions = []
        
        for issue in analysis['issues']:
            if issue['type'] == 'old_import':
                content = issue['content']
                fixed = None
                
                # Fix old app imports
                if 'from app.affiliate_link_engine' in content:
                    fixed = content.replace('from app.affiliate_link_engine', 'from src.engines.amazon_engine')
                elif 'from app.twitter_client' in content:
                    fixed = content.replace('from app.twitter_client', 'from src.engines.twitter_engine')
                elif 'from app.posting_engine' in content:
                    fixed = content.replace('from app.posting_engine', 'from src.engines.twitter_engine')
                elif 'import app.' in content:
                    # Generic app module replacement
                    fixed = content.replace('import app.', 'import src.')
                
                if fixed:
                    suggestions.append({
                        'line_num': issue['line_num'],
                        'old': content,
                        'new': fixed,
                        'type': 'import_path_fix'
                    })
            
            elif issue['type'] == 'wildcard_import':
                suggestions.append({
                    'line_num': issue['line_num'],
                    'old': issue['content'],
                    'new': f"# TODO: Replace wildcard import: {issue['content']}",
                    'type': 'wildcard_warning'
                })
        
        return suggestions
    
    def check_file_safety(self, filepath):
        """Check if file follows VS Code safety patterns"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            return {'safe': False, 'reason': 'Could not read file'}
        
        safety_issues = []
        
        # Check for module-level execution
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            
            # Module-level function calls (outside if __name__ == '__main__')
            if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*\s*\(', stripped):
                if i < 10 or 'if __name__' not in content[content.rfind('\n', 0, content.find(line)):]:
                    safety_issues.append({
                        'type': 'module_execution',
                        'line_num': i,
                        'content': stripped,
                        'message': 'Module-level execution can cause VS Code issues'
                    })
        
        # Check for immediate heavy imports at module level
        heavy_imports = ['flask', 'tweepy', 'boto3', 'pandas', 'numpy']
        for i, line in enumerate(lines[:20], 1):  # Check first 20 lines
            stripped = line.strip()
            if any(f'import {lib}' in stripped or f'from {lib}' in stripped for lib in heavy_imports):
                if 'try:' not in lines[max(0, i-3):i]:  # No try/except wrapper
                    safety_issues.append({
                        'type': 'unsafe_import',
                        'line_num': i,
                        'content': stripped,
                        'message': 'Heavy import without try/except can freeze VS Code'
                    })
        
        return {
            'safe': len(safety_issues) == 0,
            'issues': safety_issues,
            'score': max(0, 100 - len(safety_issues) * 10)
        }
    
    def run_cleanup(self):
        """Run the complete cleanup process"""
        logger.info("🧹 Starting StockSpot project cleanup...")
        
        python_files = self.scan_python_files()
        logger.info(f"Found {len(python_files)} Python files to analyze")
        
        total_issues = 0
        total_fixes = 0
        file_reports = []
        
        for filepath in python_files:
            relative_path = os.path.relpath(filepath, self.project_root)
            logger.info(f"Analyzing: {relative_path}")
            
            # Analyze imports
            import_analysis = self.analyze_imports(filepath)
            if not import_analysis:
                continue
            
            # Check safety
            safety_check = self.check_file_safety(filepath)
            
            # Get suggestions
            suggestions = self.suggest_import_fixes(import_analysis)
            
            # Count issues
            file_issues = len(import_analysis['issues']) + len(safety_check['issues'])
            total_issues += file_issues
            
            if file_issues > 0:
                total_fixes += len(suggestions)
            
            file_reports.append({
                'path': relative_path,
                'import_issues': import_analysis['issues'],
                'safety_issues': safety_check['issues'],
                'suggestions': suggestions,
                'safety_score': safety_check['score'],
                'total_issues': file_issues
            })
        
        # Generate report
        self.generate_cleanup_report(file_reports, total_issues, total_fixes)
        
        return {
            'files_analyzed': len(python_files),
            'total_issues': total_issues,
            'potential_fixes': total_fixes,
            'reports': file_reports
        }
    
    def generate_cleanup_report(self, file_reports, total_issues, total_fixes):
        """Generate a detailed cleanup report"""
        report_path = os.path.join(self.project_root, 'CLEANUP_REPORT.txt')
        
        with open(report_path, 'w') as f:
            f.write("StockSpot Project Cleanup Report\n")
            f.write("=" * 50 + "\n\n")
            
            f.write(f"Summary:\n")
            f.write(f"- Files analyzed: {len(file_reports)}\n")
            f.write(f"- Total issues found: {total_issues}\n")
            f.write(f"- Potential fixes: {total_fixes}\n\n")
            
            # High-priority issues
            high_priority = [r for r in file_reports if r['total_issues'] > 0]
            
            if high_priority:
                f.write("Files needing attention:\n")
                f.write("-" * 30 + "\n")
                
                for report in high_priority:
                    f.write(f"\n📄 {report['path']} (Safety Score: {report['safety_score']}/100)\n")
                    
                    if report['import_issues']:
                        f.write("  Import Issues:\n")
                        for issue in report['import_issues']:
                            f.write(f"    Line {issue['line_num']}: {issue['message']}\n")
                            f.write(f"      {issue['content']}\n")
                    
                    if report['safety_issues']:
                        f.write("  Safety Issues:\n")
                        for issue in report['safety_issues']:
                            f.write(f"    Line {issue['line_num']}: {issue['message']}\n")
                            f.write(f"      {issue['content']}\n")
                    
                    if report['suggestions']:
                        f.write("  Suggested Fixes:\n")
                        for suggestion in report['suggestions']:
                            f.write(f"    Line {suggestion['line_num']}: {suggestion['type']}\n")
                            f.write(f"      Old: {suggestion['old']}\n")
                            f.write(f"      New: {suggestion['new']}\n")
            else:
                f.write("✅ No critical issues found!\n")
            
            f.write(f"\n\nReport generated: {os.path.basename(__file__)}\n")
            f.write(f"Next steps:\n")
            f.write(f"1. Review high-priority files\n")
            f.write(f"2. Apply suggested import fixes\n")
            f.write(f"3. Add try/except wrappers for heavy imports\n")
            f.write(f"4. Test with: python validate_stockspot.py\n")
        
        logger.info(f"📋 Cleanup report saved: CLEANUP_REPORT.txt")


def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    cleanup = ProjectCleanup(project_root)
    
    try:
        results = cleanup.run_cleanup()
        
        print(f"\n🎯 Cleanup Complete!")
        print(f"Files analyzed: {results['files_analyzed']}")
        print(f"Issues found: {results['total_issues']}")
        print(f"Potential fixes: {results['potential_fixes']}")
        print(f"Report saved: CLEANUP_REPORT.txt")
        
        return results['total_issues'] == 0
        
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        return False


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)