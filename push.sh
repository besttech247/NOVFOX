#!/usr/bin/env bash
set -e

echo "🚀 Preparing repository for GitHub & Railway..."

# Check git initialization
if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

# Set remote origin
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/besttech247/NOVFOX.git

# Stage all files
git add .

# Check if there are changes to commit
if git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "✅ No changes to commit."
else
  git commit -m "feat: Scalp scanner with multi-exchange, multi-market & Railway deployment setup"
fi

echo "📤 Pushing to https://github.com/besttech247/NOVFOX.git (main)..."
git push -u origin main

echo "🎉 Done! Your code is live on GitHub and ready for Railway deployment."
