"""
Zen: Self-improving code system.

Core functionality for cross-repository code enhancement.
"""

import os
import sys
import logging
from typing import List, Dict, Optional
from dotenv import load_dotenv

from core.evolution import EvolutionEngine
from core.knowledge_base import KnowledgeBase
from core.git_operations import GitManager

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class Zen:
    """Main class for Zen self-improvement system."""
    
    def __init__(
        self,
        target_repo: str,
        source_repos: List[str],
        files_to_update: List[str] = None,
        branch_name: str = "zen-improvement",
        max_iterations: int = 10,
        safety_checks: bool = True
    ):
        """
        Initialize Zen system.
        
        Args:
            target_repo: URL of repository to improve
            source_repos: List of repository URLs for knowledge source
            files_to_update: Specific files to target (None for all .py files)
            branch_name: Name for new git branch
            max_iterations: Maximum self-improvement iterations
            safety_checks: Enable safety validations
        """
        self.target_repo = target_repo
        self.source_repos = source_repos
        self.files_to_update = files_to_update or []
        self.branch_name = branch_name
        self.max_iterations = max_iterations
        self.safety_checks = safety_checks
        
        # Initialize components
        self.git_manager = GitManager()
        self.knowledge_base = KnowledgeBase()
        self.evolution_engine = EvolutionEngine(
            max_iterations=max_iterations,
            safety_checks=safety_checks
        )
        
        # Validate environment
        self._validate_environment()
    
    def _validate_environment(self) -> None:
        """Validate required environment variables."""
        required_vars = ['GITHUB_TOKEN', 'GEMINI_API_KEY']
        missing = [var for var in required_vars if not os.getenv(var)]
        
        if missing:
            raise ValueError(
                f"Missing environment variables: {', '.join(missing)}"
            )
    
    def run(self) -> Dict:
        """
        Execute complete Zen improvement cycle.
        
        Returns:
            Dictionary with results and statistics
        """
        logger.info("Starting Zen improvement cycle")
        
        try:
            # Clone repositories
            repos = self.git_manager.clone_repositories(
                self.source_repos + [self.target_repo]
            )
            
            # Build knowledge base
            self.knowledge_base.build(repos)
            
            # Generate improvements
            improvements = self.evolution_engine.generate_improvements(
                self.knowledge_base,
                self.files_to_update
            )
            
            # Apply improvements to target
            applied = self.git_manager.apply_improvements(
                self.target_repo,
                improvements,
                self.branch_name
            )
            
            # Create summary
            summary = {
                'repositories_analyzed': len(self.source_repos) + 1,
                'files_targeted': len(self.files_to_update),
                'improvements_generated': len(improvements),
                'improvements_applied': len(applied),
                'new_branch': self.branch_name,
                'success': True
            }
            
            logger.info(f"Zen cycle completed: {summary}")
            return summary
            
        except Exception as e:
            logger.error(f"Zen cycle failed: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }


def main():
    """Command-line interface for Zen."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Zen: Self-improving code system')
    parser.add_argument('--target', required=True, help='Target repository URL')
    parser.add_argument('--sources', nargs='+', required=True, help='Source repository URLs')
    parser.add_argument('--files', nargs='*', help='Files to update')
    parser.add_argument('--branch', default='zen-improvement', help='Branch name')
    parser.add_argument('--max-iterations', type=int, default=10, help='Maximum iterations')
    parser.add_argument('--no-safety', action='store_true', help='Disable safety checks')
    
    args = parser.parse_args()
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run Zen
    zen = Zen(
        target_repo=args.target,
        source_repos=args.sources,
        files_to_update=args.files,
        branch_name=args.branch,
        max_iterations=args.max_iterations,
        safety_checks=not args.no_safety
    )
    
    result = zen.run()
    
    if result['success']:
        print(f"✅ Zen completed successfully")
        print(f"   Applied {result['improvements_applied']} improvements")
        print(f"   Created branch: {result['new_branch']}")
    else:
        print(f"❌ Zen failed: {result.get('error', 'Unknown error')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
