const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const express = require('express');
const { readFileSync } = require('fs');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { PubSub } = require('graphql-subscriptions');
const { createServer } = require('http');
const { useServer } = require('graphql-ws/lib/use/ws');
const { WebSocketServer } = require('ws');

// Tilføj logbeskeder for at spore fejl
console.log('Starter server...');

try {
  const typeDefs = readFileSync('./schema.graphql', 'utf-8');
  console.log('Schema loaded successfully.');

  const pubsub = new PubSub();
  const BOOK_ADDED = 'BOOK_ADDED';

  let books = [
    { id: '1', title: 'Book 1', releaseYear: 2000, authorId: '1' },
    { id: '2', title: 'Book 2', releaseYear: 2010, authorId: '2' },
  ];

  let authors = [
    { id: '1', name: 'Author 1' },
    { id: '2', name: 'Author 2' },
  ];

  const resolvers = {
    Query: {
      books: () => books,
      book: (parent, args) => books.find(book => book.id === args.id),
      authors: () => authors,
      author: (parent, args) => authors.find(author => author.id === args.id),
    },
    Mutation: {
      createBook: (parent, { authorId, title, releaseYear }) => {
        const newBook = {
          id: String(books.length + 1),
          title,
          releaseYear,
          authorId
        };
        books.push(newBook);
        pubsub.publish(BOOK_ADDED, { bookAdded: newBook });
        return newBook;
      },
      updateBook: (parent, { id, authorId, title, releaseYear }) => {
        const bookIndex = books.findIndex(book => book.id === id);
        if (bookIndex === -1) return null;
        const updatedBook = { ...books[bookIndex], authorId, title, releaseYear };
        books[bookIndex] = updatedBook;
        return updatedBook;
      },
      deleteBook: (parent, { id }) => {
        books = books.filter(book => book.id !== id);
        return { message: "Book deleted successfully" };
      }
    },
    Subscription: {
      bookAdded: {
        subscribe: () => pubsub.asyncIterator([BOOK_ADDED]),
      },
    },
    Book: {
      author: (parent) => authors.find(author => author.id === parent.authorId),
    },
    Author: {
      books: (parent) => books.filter(book => book.authorId === parent.id),
    },
  };

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  console.log('Schema and resolvers set up successfully.');

  const startServer = async () => {
    try {
      const app = express();
      // Tilføj JSON middleware
      app.use(express.json());
      const httpServer = createServer(app);
      const wsServer = new WebSocketServer({
        server: httpServer,
        path: '/graphql',
      });
      useServer({ schema }, wsServer);

      const server = new ApolloServer({
        schema,
        plugins: [{
          async serverWillStart() {
            return {
              async drainServer() {
                wsServer.close();
              }
            };
          }
        }]
      });

      await server.start();
      app.use('/graphql', expressMiddleware(server));
      console.log('Express middleware set up successfully.');

      httpServer.listen(4000, () => {
        console.log('Server is running on http://localhost:4000/graphql');
      });
    } catch (error) {
      console.error('Error during server start:', error);
    }
  };

  startServer();
} catch (error) {
  console.error('Error setting up the server:', error);
}
