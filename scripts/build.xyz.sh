#!/bin/sh

module=$1

git checkout dev-xyz
git pull --rebase origin dev-xyz
git checkout build-xyz
git pull --rebase origin build-xyz
git merge dev-xyz
git push origin build-xyz
