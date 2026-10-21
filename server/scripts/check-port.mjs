import net from 'node:net';

const port = Number(process.env.API_PORT ?? 8787);
const host = '127.0.0.1';

const server = net.createServer();
server.unref();

server.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the other API process before starting the backend.`,
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.once('listening', () => {
  server.close(() => {
    console.log(`API port ${port} is available.`);
    process.exit(0);
  });
});

server.listen(port, host);
