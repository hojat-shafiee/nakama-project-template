FROM heroiclabs/nakama-pluginbuilder:3.16.0 AS builder

ENV GO111MODULE on
ENV CGO_ENABLED 1
ENV GOPRIVATE "github.com/heroiclabs/nakama-project-template"

WORKDIR /backend
COPY . .

FROM heroiclabs/nakama:3.16.0

COPY --from=builder /backend/build/*.js /nakama/data/modules/build/
COPY --from=builder /backend/local.yml /nakama/data/
