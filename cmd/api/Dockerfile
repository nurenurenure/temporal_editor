FROM golang:1.26.4-alpine

WORKDIR /app

RUN apk add --no-cache git docker-cli

COPY go.mod go.sum ./
RUN go mod download

COPY . .

WORKDIR /app/cmd/api

RUN go build -o server .

EXPOSE 8080

CMD ["./server"]