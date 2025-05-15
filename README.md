# OpenRouter File Assistant CLI

An interactive CLI agent that allows you to perform file operations using natural language commands through OpenRouter's LLM API.

## Features

- Simple, chat-style interface built with Inquirer.js
- File operations via natural language instructions
- Supports reading, writing, updating, and deleting files
- Multi-step reasoning through LLM function calling

## Prerequisites

- Node.js (v16 or newer)
- An OpenRouter API key

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd openrouter_agent

# Install dependencies
npm install
```

## Setup

Set your OpenRouter API key as an environment variable:

```bash
export OPENROUTER_API_KEY=your_api_key
```

## Usage

Start the application in development mode:

```bash
npm run dev
```

Build and run the application:

```bash
npm run build
npm start
```

## Example Commands

Here are some example commands you can try:

- "Create a file named hello.txt with content 'Hello, World!'"
- "Read the contents of hello.txt"
- "Append 'This is a new line.' to hello.txt"
- "Delete the file hello.txt"
- "Create a new file todo.txt with a list of tasks"

## Security Considerations

The application includes basic path sanitization to prevent directory traversal, but it's recommended to use this tool in a controlled environment.

## License

ISC