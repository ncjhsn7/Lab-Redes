# Terminal 1
```
node server.js --host 0.0.0.0 --port 8080
```

# Terminal 2
## Listagem de arquivos
```
node client.js --host 127.0.0.1 --port 8080 list
```

# Criação de arquivos
```
node client.js --host 127.0.0.1 --port 8080 put teste2.txt
```

# Encerrar sessão
```
node client.js --host 127.0.0.1 --port 8080 quit
```

# Arquivos servidor
```
ls server_storage
``` 

# Arquitetura
protocol é a base compartilhada → define o “idioma” da aplicação. //
server e client dependem de protocol para entender as mensagens.
Ambos também dependem de módulos nativos (net, fs, path).
Não há classes personalizadas, só objetos (upload, state) e funções.
```
            Node
             │
       ┌─────┴─────┐
       │           │
     server      client
       │           │
       └─────┬─────┘
             │
         protocol

```