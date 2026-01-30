"""
Zen: Self-improving code system.

Core functionality for cross-repository code enhancement.
"""

import os
import sys
import logging
from typing import List, Dict, Optional, Any, Final, Tuple

# Assuming core modules provide necessary implementations
# We assume these imports are fast and necessary
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
REQUIRED_ENV_VARS: Final[Tuple[str, str]] = ('GITHUB_TOKEN', 'GEMINI_API_KEY')

def setup_logging(level=logging.INFO):
    """Initializes standard logging configuration."""
    # Check if logging is already configured to prevent duplicate handlers
    if not logging.root.handlers:
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
        Initialize Zen system, performing immediate validation.
        """
        if not target_repo_url:
            raise ZenConfigError("Target repository URL cannot be empty.")

        self.target_repo_url: Final[str] = target_repo_url
        self.source_repo_urls: Final[List[str]] = source_repo_urls
        # Use tuple conversion for immutability and minor performance gain in lookups if list is large
        self.files_to_update: Final[Tuple[str, ...]] = tuple(files_to_update) if files_to_update is not None else tuple()
        self.branch_name: Final[str] = branch_name
        self.max_iterations: Final[int] = max_iterations
        self.safety_checks: Final[bool] = safety_checks
        
        # --- Dependency Initialization ---
        # Dependencies initialized immediately as they are required for all operations
        self.git_manager: Final[GitManager] = GitManager()
        self.knowledge_base: Final[KnowledgeBase] = KnowledgeBase()
        self.evolution_engine: Final[EvolutionEngine] = EvolutionEngine(
            max_iterations=max_iterations,
            safety_checks=safety_checks
        )
        
        # Perform configuration validation immediately
        self._validate_environment()
    
    def _validate_environment(self) -> None:
        """Validate required environment variables are set."""
        
        # Use a generator expression for efficient checking
        missing = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
        
        if missing:
            raise ZenConfigError(
                f"Missing required environment variables: {', '.join(missing)}"
            )
            
    def _cleanup(self, local_paths: List[str]) -> None:
        """Utility to ensure temporary directories are removed."""
        if not local_paths:
            return

        # Use DEBUG level for cleanup attempt announcements to reduce log noise
        logger.debug(f"Attempting cleanup for {len(local_paths)} temporary local repositories.")
        try:
            self.git_manager.cleanup_local_paths(local_paths)
            logger.debug("Cleanup successful.")
        except Exception as e:
            # Log cleanup failure as a warning, but do not interrupt the flow
            logger.warning(f"Failed to clean up temporary paths: {e}")
    
    def run(self) -> Dict[str, Any]:
        """
        Execute complete Zen improvement cycle.
        
        Flow: Clone -> Build Knowledge -> Generate Improvements -> Apply -> Cleanup.
        
        Returns:
            Dictionary with results and statistics
        """
        logger.info("Starting Zen improvement cycle...")
        
        all_local_paths: List[str] = []
        
        # 1. Pre-calculation and Configuration
        # Ensure target is always the last element for reliable slicing
        repo_urls_to_clone: Final[List[str]] = self.source_repo_urls + [self.target_repo_url]
        total_repos: Final[int] = len(repo_urls_to_clone)
        
        # Initialize result dictionary structure early
        result: Dict[str, Any] = {
            'success': False, 
            'repositories_analyzed': total_repos, 
            'improvements_applied': 0,
            'files_targeted': len(self.files_to_update) or 'All',
            'target_path': None
        }

        try:
            # 2. Clone Repositories (Heavy I/O)
            cloned_paths = self.git_manager.clone_repositories(repo_urls_to_clone)
            all_local_paths = cloned_paths 
            
            if len(cloned_paths) != total_repos:
                raise RuntimeError("GitManager failed to clone all specified repositories.")

            # Separate paths based on known order
            target_path: Final[str] = cloned_paths[-1]
            source_paths: Final[List[str]] = cloned_paths[:-1]
            result['target_path'] = target_path # Record path early for reporting

            logger.info(f"Target repository cloned locally: {target_path}")
            
            # 3. Build Knowledge Base (from sources only)
            if source_paths:
                self.knowledge_base.build(source_paths)
                logger.debug(f"Knowledge base built from {len(source_paths)} repositories.")
            
            # 4. Generate Improvements (CPU/LLM heavy)
            improvements = self.evolution_engine.generate_improvements(
                knowledge_base=self.knowledge_base,
                target_local_path=target_path,
                files_to_target=list(self.files_to_update) # Convert tuple back to list if required by engine
            )
            
            if not improvements:
                logger.info("No improvements generated. Cycle finished successfully.")
                result['success'] = True
                result['improvements_generated'] = 0
                return result

            # 5. Apply Improvements to Target (I/O heavy)
            commit_msg: Final[str] = f"Zen Improvement: Applied {len(improvements)} generated changes."
            
            applied_details = self.git_manager.apply_improvements(
                local_repo_path=target_path,
                improvements=improvements,
                branch_name=self.branch_name,
                commit_message=commit_msg
            )
            
            # 6. Final Summary Update
            result.update({
                'improvements_generated': len(improvements),
                'improvements_applied': len(applied_details),
                'new_branch': self.branch_name,
                'success': True
            })
            
            logger.info(f"Zen cycle successfully completed. Applied {result['improvements_applied']} changes.")
            return result
            
        except ZenConfigError as e:
            logger.critical(f"Configuration Error: {e}")
            result['error'] = f"Configuration Error: {str(e)}"
            return result
            
        except Exception as e:
            # Log the full traceback for operational errors
            logger.exception("Zen cycle failed due to an unexpected operational error.")
            result['error'] = f"Operational failure: {type(e).__name__}: {str(e)}"
            return result
            
        finally:
            # 7. Cleanup: Ensure temporary directories are removed
            self._cleanup(all_local_paths)


def main():
    """Command-line interface for Zen."""
    import argparse
    
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
        
        # Use target_path from the result dictionary for robust output
        target_path_output = result.get('target_path')
        
        if result['success']:
            print("-" * 40)
            print(f"✅ Zen completed successfully!")
            print(f"   Analyzed repositories: {result['repositories_analyzed']}")
            print(f"   Improvements applied: {result['improvements_applied']}")
            if target_path_output:
                 print(f"   Local changes saved at: {target_path_output}")
            if result.get('new_branch'):
                 print(f"   Created branch: {result['new_branch']}")
            print("-" * 40)
        else:
            # Direct error output to stderr
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