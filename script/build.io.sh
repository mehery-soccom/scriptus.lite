#!/bin/sh

module=$1

git checkout build-xyz-${module}
git pull --rebase origin build-xyz-${module}
git checkout build-io-${module}
git pull --rebase origin build-io-${module}
git merge build-xyz-${module}
git push origin build-xyz-${module}
