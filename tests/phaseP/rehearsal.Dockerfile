# syntax=docker/dockerfile:1
FROM debian:bookworm-slim
COPY pg-cron.tar.gz pg-net.tar.gz vault.tar.gz /tmp/extensions/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then cat /run/secrets/proxy_ca >> /etc/ssl/certs/ca-certificates.crt; fi; \
    set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-common ca-certificates; \
    printf '\ncreate_main_cluster = false\n' >> /etc/postgresql-common/createcluster.conf; \
    apt-get install -y --no-install-recommends postgresql-15 postgresql-server-dev-15 build-essential libcurl4-openssl-dev libsodium-dev; \
    cd /tmp/extensions; \
    echo 'd950bc29155f31017567e23a31d268ff672e98276c0e9d062512fb7870351f03  pg-cron.tar.gz' | sha256sum -c -; \
    echo '04cf8a7070c7fa47ffc175bfc75542be1172f859c499aeeb259c379c584ff1f9  pg-net.tar.gz' | sha256sum -c -; \
    echo '344edb590e574cc94937d5665f696b4b04c3af5ae9431cc9050da657ab563b11  vault.tar.gz' | sha256sum -c -; \
    tar xzf vault.tar.gz; make -C vault-0.3.1 -j2; make -C vault-0.3.1 install; \
    tar xzf pg-cron.tar.gz; tar xzf pg-net.tar.gz; \
    make -C pg_cron-1.6.7 -j2; make -C pg_cron-1.6.7 install; \
    make -C pg_net-0.14.0 -j2; make -C pg_net-0.14.0 install; \
    apt-get install -y --no-install-recommends libcurl4 libsodium23; \
    apt-get purge -y postgresql-server-dev-15 build-essential libcurl4-openssl-dev libsodium-dev; apt-get autoremove -y; \
    cd /; update-ca-certificates --fresh >/dev/null; rm -rf /tmp/extensions /var/lib/apt/lists/*; \
    test ! -d /var/lib/postgresql/15/main; mkdir -p /var/lib/postgresql/data; chown postgres:postgres /var/lib/postgresql/data; \
    runuser -u postgres -- /usr/lib/postgresql/15/bin/initdb -D /var/lib/postgresql/data --auth=trust
ENV PATH="/usr/lib/postgresql/15/bin:${PATH}"
USER postgres
CMD ["postgres", "-D", "/var/lib/postgresql/data", "-c", "listen_addresses=*", "-c", "shared_preload_libraries=pg_cron,pg_net", "-c", "cron.database_name=postgres", "-c", "cron.launch_active_jobs=off"]
