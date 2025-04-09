#!/bin/sh

module=$1

git checkout build-io-${module}
git pull --rebase origin build-io-${module}
git checkout build-com-${module}
git pull --rebase origin build-com-${module}
git merge build-io-${module}
git push origin build-com-${module}
