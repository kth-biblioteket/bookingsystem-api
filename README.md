# KTHB Bookingsystem api
API mot Bookingsystem(grupprum etc)

##

###


#### Dependencies

Node 16.13.2

##### Installation

1.  Skapa folder på server med namnet på repot: "/local/docker/bookingsystem-api"
2.  Skapa och anpassa docker-compose.yml i foldern
```
version: '3.6'

services:
  bookingsystem-api:
    container_name: bookingsystem-api
    image: ghcr.io/kth-biblioteket/bookingsystem-api:${REPO_TYPE}
    restart: always
    env_file:
      - ./bookingsystem-api.env
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bookingsystem-api.rule=Host(`${DOMAIN_NAME}`) && PathPrefix(`${PATHPREFIX}`)"
      - "traefik.http.routers.bookingsystem-api.entrypoints=websecure"
      - "traefik.http.routers.bookingsystem-api.tls=true"
      - "traefik.http.routers.bookingsystem-api.tls.certresolver=myresolver"
    networks:
      - "apps-net"

networks:
  apps-net:
    external: true
```
3.  Skapa och anpassa .env(för composefilen) i foldern
```
PATHPREFIX=/bookingsystem
DOMAIN_NAME=api-ref.lib.kth.se
API_ROUTES_PATH=/v1
```
4.  Skapa och anpassa bookingsystem-api.env (för applikationen) i foldern
```
PORT=80
SECRET=xxxxxx
APIKEYREAD=xxxxxxxxxxxxxxxxxxxxxxxxx
DB_DATABASE=bookingsystem
DB_USER=bookingsystem
DB_PASSWORD=xxxxxxxxxxxx
DB_ROOT_PASSWORD=xxxxxxxxxxxxxxx
API_ROUTES_PATH=/v1
CORS_WHITELIST="http://localhost, https://apps.lib.kth.se, https://apps-ref.lib.kth.se, https://www.kth.se"
ENVIRONMENT=development
```
5. Skapa deploy_ref.yml i github actions
6. Skapa deploy_prod.yml i github actions
7. Github Actions bygger en dockerimage i github packages
8. Starta applikationen med docker compose up -d --build i "local/docker/ldap-api"

