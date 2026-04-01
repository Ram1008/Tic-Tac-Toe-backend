FROM heroiclabs/nakama:3.17.0

COPY ./data /nakama/data
COPY ./modules /nakama/modules

ENTRYPOINT ["/bin/sh", "-ecx", "\
/nakama/nakama migrate up --database.address ram:Nakama%40Ram123@34.180.19.216:5432/Nakama?sslmode=disable && \
exec /nakama/nakama \
--name nakama1 \
--database.address ram:Nakama%40Ram123@34.180.19.216:5432/Nakama?sslmode=disable \
--runtime.path /nakama/modules \
--config /nakama/data/config.yml \
--socket.address 0.0.0.0:7350"]