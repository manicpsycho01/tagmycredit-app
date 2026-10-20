#!/usr/bin/env bash
# Local Postgres 17 cluster kept inside the project (.pgdata), on port 54329.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=/opt/homebrew/opt/postgresql@17/bin
DATA=.pgdata
PORT=54329
case "${1:-}" in
  start)
    if [ ! -d "$DATA" ]; then
      "$BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
    fi
    if ! "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "$BIN/pg_ctl" -D "$DATA" -l "$DATA/server.log" -o "-p $PORT -k /tmp" -w start >/dev/null
    fi
    "$BIN/psql" -h localhost -p $PORT -U postgres -tAc "select 1 from pg_database where datname='tmc'" | grep -q 1 \
      || "$BIN/createdb" -h localhost -p $PORT -U postgres tmc
    "$BIN/psql" -h localhost -p $PORT -U postgres -tAc "select 1 from pg_database where datname='tmc_test'" | grep -q 1 \
      || "$BIN/createdb" -h localhost -p $PORT -U postgres tmc_test
    echo "Postgres running on localhost:$PORT (databases: tmc, tmc_test)"
    ;;
  stop)
    "$BIN/pg_ctl" -D "$DATA" -w stop >/dev/null && echo "Postgres stopped"
    ;;
  reset)
    "$0" start >/dev/null
    for db in tmc tmc_test; do
      "$BIN/psql" -h localhost -p $PORT -U postgres -qc "drop database if exists $db with (force)"
      "$BIN/createdb" -h localhost -p $PORT -U postgres $db
    done
    echo "Databases recreated"
    ;;
  *) echo "usage: db.sh start|stop|reset"; exit 1;;
esac
