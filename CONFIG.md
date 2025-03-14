# Configuration

```.properties
mry.redis.host=<localhost>
mry.redis.port=6379

mongodb.url = mongodb://<username>:<password>@<host>:27017/<db>?authSource=admin&authMechanism=SCRAM-SHA-1&maxPoolSize=20&retryWrites=false
mongodb.secured.sslCA=./../certs/rds-combined-ca-bundle.pem
mongodb.secured.enabled=true

mry.scriptus.secret = <scriptus-secret>
```
