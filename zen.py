"""
Zen: Self-improving code system.

Core functionality for cross-repository code enhancement.
"""

import os
import sys
import logging
from typing import List, Dict, Optional, Any, Final

# Assuming core modules provide necessary implementations
from core.evolution import EvolutionEngine
from core.knowledge_base import KnowledgeBase
from core.git_operations import GitManager 

# Load environment variables early
from dotenv import load_dotenv
load_dotenv()

# --- Configuration & Setup ---

# Configure global logger for this module
logger = logging.getLogger(__name__)

# Define required environment variables as a module constant
REQUIRED_ENV_VARS: Final[List[str]] = ['GITHUB_TOKEN', 'GEMINI_API_KEY']

def setup_logging(level=logging.INFO):
    """Initializes standard logging configuration."""
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        stream=sys.stdout
    )

class ZenConfigError(Exception):
    """Custom exception for configuration related errors."""
    pass

class Zen:
    """
    Main class for Zen self-improvement system.
    Orchestrates cloning, knowledge generation, evolution, and application.
    """
    
    def __init__(
        self,
        target_repo_url: str,
        source_repo_urls: List[str],
        files_to_update: Optional[List[str]] = None,
        branch_name: str = "zen-improvement",
        max_iterations: int = 10,
        safety_checks: bool = True
    ):
        """
        Initialize Zen system.
        """
        if not target_repo_url:
            raise ZenConfigError("Target repository URL cannot be empty.")

        self.target_repo_url: str = target_repo_url
        self.source_repo_urls: List[str] = source_repo_urls
        # Ensure files_to_update is treated consistently as a List[str]
        self.files_to_update: List[str] = files_to_update if files_to_update is not None else []
        self.branch_name: str = branch_name
        self.max_iterations: int = max_iterations
        self.safety_checks: bool = safety_checks
        
        # --- Dependency Initialization ---
        self.git_manager = GitManager()
        self.knowledge_base = KnowledgeBase()
        self.evolution_engine = EvolutionEngine(
            max_iterations=max_iterations,
            safety_checks=safety_checks
        )
        
        # Perform configuration validation immediately
        self._validate_environment()
    
    def _validate_environment(self) -> None:
        """Validate required environment variables are set."""
        missing = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
        
        if missing:
            raise ZenConfigError(
                f"Missing required environment variables: {', '.join(missing)}"
            )
            
    def _cleanup(self, local_paths: List[str]) -> None:
        """Utility to ensure temporary directories are removed."""
        if not local_paths:
            return

        logger.info(f"Initiating cleanup for {len(local_paths)} temporary local repositories.")
        try:
            self.git_manager.cleanup_local_paths(local_paths)
            logger.debug("Cleanup successful.")
        except Exception as e:
            # Log the failure but don't re-raise, cleanup failure should not crash final result reporting
            logger.warning(f"Failed to clean up temporary paths: {e}", exc_info=False)
    
    def run(self) -> Dict[str, Any]:
        """
        Execute complete Zen improvement cycle.
        
        Flow: Clone -> Build Knowledge -> Generate Improvements -> Apply -> Cleanup.
        
        Returns:
            Dictionary with results and statistics
        """
        logger.info("Starting Zen improvement cycle...")
        
        all_local_paths: List[str] = []
        target_path: Optional[str] = None
        repo_urls_to_clone: List[str] = []
        
        # Define base failure structure for consistency
        failure_result = {'success': False, 'repositories_analyzed': 0, 'improvements_applied': 0}

        try:
            # 1. Clone Repositories
            # We enforce the target repository is cloned LAST for predictable indexing.
            repo_urls_to_clone = self.source_repo_urls + [self.target_repo_url]
            
            cloned_paths = self.git_manager.clone_repositories(repo_urls_to_clone)
            all_local_paths = cloned_paths # Store full list for cleanup
            
            if len(cloned_paths) != len(repo_urls_to_clone):
                raise RuntimeError("GitManager failed to clone all specified repositories.")

            # Separate paths based on known order (target is the last one)
            target_path = cloned_paths[-1]
            source_paths = cloned_paths[:-1]
            
            total_repos = len(repo_urls_to_clone)
            logger.info(f"Target repository cloned locally: {target_path}")
            logger.info(f"Found {len(source_paths)} source repositories for knowledge base.")
            
            # 2. Build Knowledge Base (from sources only)
            if source_paths:
                self.knowledge_base.build(source_paths)
            else:
                logger.warning("No source knowledge provided for synthesis.")
            
            # 3. Generate Improvements (targeting the local target path)
            improvements = self.evolution_engine.generate_improvements(
                knowledge_base=self.knowledge_base,
                target_local_path=target_path,
                files_to_target=self.files_to_update
            )
            
            if not improvements:
                logger.info("No improvements generated. Cycle finished successfully.")
                return {
                    'repositories_analyzed': total_repos,
                    'files_targeted': len(self.files_to_update) or 'All',
                    'improvements_generated': 0,
                    'improvements_applied': 0,
                    'success': True
                }

            # 4. Apply Improvements to Target (using local path)
            commit_msg = f"Zen Improvement: Applied {len(improvements)} generated changes."
            
            applied_details = self.git_manager.apply_improvements(
                local_repo_path=target_path,
                improvements=improvements,
                branch_name=self.branch_name,
                commit_message=commit_msg
            )
            
            # 5. Create Summary
            summary = {
                'repositories_analyzed': total_repos,
                'files_targeted': len(self.files_to_update) or 'All',
                'improvements_generated': len(improvements),
                'improvements_applied': len(applied_details),
                'new_branch': self.branch_name,
                'target_path': target_path,
                'success': True
            }
            
            logger.info(f"Zen cycle successfully completed. Applied {summary['improvements_applied']} changes.")
            return summary
            
        except ZenConfigError as e:
            logger.critical(f"Configuration Error: {e}")
            return {**failure_result, 'error': f"Configuration Error: {str(e)}"}
            
        except Exception as e:
            # Log the full traceback for operational errors
            logger.exception("Zen cycle failed due to an unexpected operational error.")
            
            # Use the dynamically calculated number of analyzed repos if available
            analyzed_count = len(repo_urls_to_clone) if repo_urls_to_clone else 0

            return {
                **failure_result, 
                'error': f"Operational failure: {type(e).__name__}: {str(e)}",
                'repositories_analyzed': analyzed_count
            }
            
        finally:
            # 6. Cleanup: Ensure temporary directories are removed
            self._cleanup(all_local_paths)


def main():
    """Command-line interface for Zen."""
    import argparse
    
    # Logging is set up outside main, but we ensure it's configured.
    
    parser = argparse.ArgumentParser(
        description='Zen: Self-improving code system. Orchestrates knowledge synthesis and code evolution.',
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    parser.add_argument(
        '--target', 
        required=True, 
        help='Target repository URL (e.g., https://github.com/user/project)'
    )
    parser.add_argument(
        '--sources', 
        nargs='+', 
        required=True, 
        help='Space-separated list of source repository URLs for knowledge extraction'
    )
    parser.add_argument(
        '--files', 
        nargs='*', 
        default=None, 
        help='Optional: Specific files (paths relative to target repo root) to focus updates on.'
    )
    parser.add_argument(
        '--branch', 
        default='zen-improvement', 
        help='Name for the new git branch created with improvements (default: zen-improvement)'
    )
    parser.add_argument(
        '--max-iterations', 
        type=int, 
        default=10, 
        help='Maximum number of evolution iterations (default: 10)'
    )
    parser.add_argument(
        '--no-safety', 
        action='store_true', 
        help='Disable safety checks (e.g., static analysis, test execution) during evolution.'
    )
    
    args = parser.parse_args()
    
    try:
        # Run Zen
        zen = Zen(
            target_repo_url=args.target,
            source_repo_urls=args.sources,
            files_to_update=args.files,
            branch_name=args.branch,
            max_iterations=args.max_iterations,
            safety_checks=not args.no_safety
        )
        
        result = zen.run()
        
        if result['success']:
            print("-" * 40)
            print(f"✅ Zen completed successfully!")
            print(f"   Analyzed repositories: {result['repositories_analyzed']}")
            print(f"   Improvements applied: {result['improvements_applied']}")
            if target_path := result.get('target_path'):
                 print(f"   Local changes saved at: {target_path}")
            if result.get('new_branch'):
                 print(f"   Created branch: {result['new_branch']}")
            print("-" * 40)
        else:
            # Direct error output to stderr for better standard CLI behavior
            print("-" * 40, file=sys.stderr)
            print(f"❌ Zen failed: {result.get('error', 'Unknown error')}", file=sys.stderr)
            print("-" * 40, file=sys.stderr)
            sys.exit(1)

    except ZenConfigError as e:
        logger.critical(f"Startup Failure (Configuration): {e}")
        sys.exit(1)
    except Exception as e:
        logger.critical(f"Critical error during execution startup: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    setup_logging()
    main()"""