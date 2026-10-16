#!/bin/sh
# Inicia rs0 de un solo nodo si Mongo local todavía no es replica set.
# El miembro es localhost:27017, que es la URI de la caja.
mongosh --quiet --eval 'try { rs.status() } catch (e) { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] }) }'
