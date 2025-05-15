# Building an Interactive LLM-Powered CLI Agent with TypeScript, Node.js, and React Ink

## Introduction

Large Language Models (LLMs) can be harnessed to create interactive command-line assistants that perform real-world tasks. In this guide, we’ll walk through building a **conversational file editor CLI agent** – a chatbot-like terminal interface that understands natural language instructions and manipulates files on disk accordingly. The agent will receive user prompts (e.g. “Create a file named *hello.txt* with content 'Hello World'”), use an LLM (via OpenRouter’s API) to reason about the request, **decide which file operation function to call**, execute that function (read, write, update, or delete a file), possibly iterate through multiple tool calls, and finally respond to the user with a summary of its actions.

This kind of tool-using LLM is often called an *agentic* model: the LLM can take actions (calling tools/functions) in a loop until it achieves the user’s goal. We will combine several technologies to achieve this:

* **OpenRouter’s LLM Tool-Calling Interface:** A unified API (compatible with OpenAI’s function-calling schema) that lets the LLM request function calls in JSON format. We’ll define file-system operations as available “tools” the LLM can use.
* **Node.js with TypeScript:** The runtime where we implement the actual file operations (reading/writing files) and the agent loop logic.
* **React Ink:** A library for building rich interactive CLI apps with React components. We’ll use it to create a chat-style **terminal UI**, so the experience feels like messaging with a smart assistant in your terminal rather than a plain text dump.

By the end, you’ll have an **LLM-driven file editor CLI agent** that listens to user instructions, uses structured function calls to interact with the file system, and responds with friendly natural-language updates about what it did. This documentation provides best practices, code snippets, and design considerations for such a system, leveraging modern LLM features (OpenAI-style function calling with JSON schemas) for reliability and safety.

## Architecture Overview

Building an agentic CLI involves coordinating between the user, the LLM, the tool functions, and the UI. The high-level flow looks like this:

&#x20;*Overview of the function-calling loop in an LLM agent. The model (assistant) receives the user’s request along with definitions of available functions. It may respond with a JSON tool request (function name & arguments) instead of a final answer. The CLI app then executes the requested function (e.g. read or write a file) and returns the result as a special tool-response message. The LLM uses that result to inform its next step, eventually producing a final answer to the user after all needed tools have been called.*

* **User Message:** The user types a request or question in the terminal (e.g. *“Open the file `notes.txt` and add a line at the end.”*). This becomes a new message in the conversation history.
* **LLM Reasoning (via OpenRouter):** We send the conversation (past messages) and a list of tool/function definitions to the LLM through OpenRouter’s `/chat/completions` API. The model sees the user’s request and the available tool specs, and decides how to respond. Crucially, it can either produce a direct answer *or* call a function. In our case, if the request involves file operations, the LLM will likely choose to output a **tool call** – a structured JSON indicating which function to use and with what arguments.
* **Tool Invocation:** Our Node.js backend intercepts the LLM’s response. If it contains a function call, our code does not treat this as a final answer, but rather as an instruction to execute a tool. We parse the JSON (function name and arguments) and call the corresponding local function (for example, `readFile({path: "notes.txt"})`). *The LLM does not execute the function itself – it only suggests it; our code is responsible for performing the action and returning the result】.*
* **Tool Result as Feedback:** After executing the function, we take the result (e.g. the file’s content, or a success confirmation) and add it to the conversation history as a special message with role `"tool"` (OpenAI API calls this role `"function"` in some contexts). This message includes the name of the tool, an ID to tie it to the LLM’s request, and the output data. For example, if the LLM requested `readFile("notes.txt")`, we might append a tool message: `{ role: "tool", name: "readFile", tool_call_id: "<ID>", content: "...(file contents)..." }`.
* **LLM Continues/Answers:** We call the LLM again with the updated message list (now containing the tool’s result). The model will incorporate the new information. It might now have what it needs to answer the user (e.g. it read the file content and can summarize or confirm the change), or it might decide to call another tool if the task wasn’t complete. The process can repeat in a loop: the LLM requests a series of tool calls, each time we execute them and feed results back, until finally the model returns a normal **assistant message** with no further function calls, which is the answer for the user.
* **Final Response:** When the LLM responds with a regular message (no tool calls), our agent loop ends. We then display the assistant’s answer in the chat UI for the user to read. In our file editor scenario, this answer is typically a **natural-language summary of the changes** it made (e.g. “✅ Added the line to *notes.txt*.”).

This architecture ensures the LLM can perform multi-step operations safely and transparently. By using OpenRouter’s standardized function-calling interface, we let the model **structure its intentions in JSON** rather than free-form text, which makes it much easier to reliably execute the model’s intended actions and incorporate the results. The React Ink interface will simply tie it all together into a smooth interactive experience for the user.

## Defining File Operation Tools for the LLM

First, we need to tell the LLM what tools (functions) it has access to. OpenRouter (like OpenAI’s API) expects a JSON schema definition for each function, including its name, description, and parameters. Here’s how we can define our file system operations:

* **`readFile`** – Takes a file path and returns the file’s content.
* **`writeFile`** – Takes a file path and text content, writes the file (creating or overwriting), and returns a confirmation or the written content.
* **`updateFile`** – Takes a file path, some content or perhaps an instruction (e.g. text to append), updates the file (e.g. append or modify), and returns confirmation or new content.
* **`deleteFile`** – Takes a file path, deletes the file, and returns a confirmation.

Each function definition will be a JSON object with a `name`, a human-readable `description` (so the model knows when to use it), and a `parameters` schema describing the function’s expected arguments. For example, a simplified definition in TypeScript notation might look like:

```ts
const tools = [
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the text content of a file from disk.",
      parameters: {
        type: "object",
        properties: {
          path: { 
            type: "string", 
            description: "The filesystem path to the file." 
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write text content to a file on disk, creating or overwriting it.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file path to write to." },
          content: { type: "string", description: "The text content to write into the file." }
        },
        required: ["path", "content"]
      }
    }
  },
  // ... similarly for updateFile, deleteFile ...
];
```

This structure is **OpenAI/OpenRouter compatible JSON schema** for functions. The model will see these definitions in our API request. The descriptions should clearly state what each function does, and the parameters schema defines what arguments are needed. A well-structured schema helps the LLM generate correct function-call JSON when it wants to use the tool.

**Best Practices for Tool Definitions:**

* *Be descriptive but concise:* A good description helps the LLM choose the right function. For example, “Write text content to a file, creating it if it doesn’t exist” is clear about what `writeFile` does. The model uses this info to decide between `writeFile` vs `updateFile`, etc.

* *Use specific parameter names/types:* Make sure the JSON schema is accurate (string vs number, required fields, etc.). The LLM will adhere to this schema when formatting its tool call. For instance, above we mark `"path"` and `"content"` as required for `writeFile`, so the model won’t omit them.

* *Plan function outputs:* The schema only covers inputs, but you should decide what each function returns in your implementation and how to format that result for the LLM. For reading files, the content (string) is the result. For a write or delete operation, you might return a simple confirmation object or message. It’s often convenient to return **JSON output** as a string – for example, our `search_gutenberg_books` tool (from an OpenRouter example) returns a list of book results in JSON form. In our case, `readFile` could return the file text (possibly JSON-escaped), whereas `writeFile/deleteFile` might return a JSON like `{"success": true}` or a message `"File deleted."`. The returned content will be fed back to the model, so it should be something the model can use to formulate its answer.

* *Avoid overly broad tools:* Keep tools atomic and focused. For security and predictability, you wouldn’t, for example, expose a direct `exec` shell command in this context. Stick to the minimal set needed (file CRUD in this case). Each tool is like an API endpoint the model can hit – fewer is easier to manage.

Once tools are defined, we include them in the OpenRouter API call. This informs the LLM about their availability. The model **will not call tools not listed**, and it won’t execute any code on its own – it only returns a JSON indicating a tool request if needed. Next, we’ll see how to detect and handle those requests.

## Implementing the Agentic Loop

The core “intelligence” of our CLI agent is in the loop that alternates between LLM reasoning and tool execution. We call this the *agent loop* because the LLM acts as an agent deciding actions step by step. Here’s how to implement it:

1. **Send User Prompt to LLM:** When the user enters a message, we append it to our `messages` array (which holds the conversation). For example:

   ```ts
   messages.push({ role: "user", content: userInput });
   const response = await openaiClient.chat.completions.create({
       model: MODEL_ID,
       tools: tools,
       messages: messages
   });
   const assistantMessage = response.choices[0].message;
   ```

   Using the OpenRouter API, we include the `tools` definitions and the current `messages`. The LLM will produce a completion. We inspect `assistantMessage`: it may contain a normal reply, or it may signal a tool invocation. In OpenRouter’s response format, an assistant message that calls a function will have a `tool_calls` field (an array of tool call requests) and a special *finish reason* indicating a function/tool is being called.

2. **Check for Tool Call:** We determine if the LLM wants to use a tool. In OpenAI’s API, this is indicated by `assistantMessage.function_call` being non-undefined; in OpenRouter, we have something like `assistantMessage.tool_calls` array. For example, `assistantMessage.tool_calls[0]` might be:

   ```json
   {
     "id": "XYZ",
     "function": {
       "name": "readFile",
       "arguments": "{ \"path\": \"notes.txt\" }"
     }
   }
   ```

   If such a tool call exists, our agent should execute it instead of treating this as a final answer. (If no tool call exists, skip to step 5.)

3. **Execute the Tool Function:** We parse the tool request. The JSON arguments come as a string, so parse them into an object (e.g. using `JSON.parse`). Identify which function by name. Then call the corresponding implementation in Node. For our file tools:

   * `readFile` – use Node’s `fs.readFileSync(path, 'utf-8')` (or async `fs.promises.readFile`). Catch errors if file not found, etc.
   * `writeFile` – use `fs.writeFileSync(path, content)`.
   * `updateFile` – perhaps read the file, apply changes, then write.
   * `deleteFile` – use `fs.unlinkSync(path)`.

   Make sure to handle exceptions (e.g., attempt to read a non-existent file) and decide what to return to the LLM. Ideally, even on failure, you return an error message or code that the LLM can understand (so it can perhaps apologize or ask the user for a different path).

   Let’s say `readFile("notes.txt")` returns the string `"Hello\nThis is a note.\n"` as file content. We will prepare that result for the LLM.

4. **Add Tool Response to Messages:** We now append a new message to the conversation with `role: "tool"` (OpenAI calls this a `"function"` role message). This message should include:

   * `name`: the function name (e.g. `"readFile"`),
   * `tool_call_id`: the ID from the LLM’s tool request (so the model knows which call this is answering),
   * `content`: the *result* of the function call, stringified. Often we put JSON data here as a string. In our example, the content could literally be the file text, or JSON like `{"content": "Hello\nThis is a note.\n"}`. The OpenRouter docs show adding the raw JSON result as the content.

   For instance:

   ```ts
   const toolCall = assistantMessage.tool_calls[0];
   const toolName = toolCall.function.name;              // "readFile"
   const args = JSON.parse(toolCall.function.arguments); // { path: "notes.txt" }
   const result = TOOL_MAPPING[toolName](...args);       // execute the actual function
   messages.push({
       role: "tool",
       name: toolName,
       tool_call_id: toolCall.id,
       content: JSON.stringify(result)
   });
   ```

   Here, `TOOL_MAPPING` is a simple map from function name to the actual JS function implementation (similar to what the OpenRouter example uses). We JSON-stringify the result to ensure it’s a string. Now the conversation history has:

   1. User’s request,
   2. Assistant’s intermediate message (with tool call spec),
   3. Tool’s response message (with the actual data from our filesystem).

5. **Loop Back to LLM:** We’re not done yet – the assistant hasn’t given an answer to the user. We call the LLM API again, sending the updated `messages` array (which now includes the tool’s output). On this second call, the model sees that its previous attempt to use a tool resulted in some data, which is now provided in the conversation. It will continue the conversation:

   * In many cases, the model will now use that data to produce a final answer. For example, it might now answer the user with a summary: “I’ve added the line to the file. The file now contains X lines.”
   * In more complex scenarios, the model **could decide to call another function** if needed. For example, if the user said “Take the last line of notes.txt and copy it to summary.txt,” the agent might `readFile(notes.txt)` first, then do a `writeFile(summary.txt, lastLine)`. This would involve two tool calls in sequence. The loop handles this naturally: after the first tool call, the model’s next response might be another tool request (e.g., call `writeFile`). We would execute it, append result, and call the model again.
   * Our loop therefore should repeat: check if the new assistant message has another `tool_call`. If yes, execute and continue. If not, we’ve reached the final answer.

   In pseudocode, the **agent loop** looks like:

   ```ts
   while (true) {
       const resp = await openaiClient.chat.completions.create({ model, tools, messages });
       const msg = resp.choices[0].message;
       messages.push(msg);  // add assistant message (which might contain a tool call or final answer)
       if (msg.tool_calls) {
           // The assistant wants to use a tool
           const toolRespMessage = handleToolCall(msg.tool_calls[0]);
           messages.push(toolRespMessage);
           // loop continues to send the updated context back to LLM
       } else {
           // No more tool calls, break loop
           break;
       }
   }
   // After loop, the last message in `messages` is the assistant's final answer.
   display(messages[messages.length - 1].content);
   ```

   This pattern is exactly how an *agentic loop* operates. We keep calling the LLM until the model stops requesting tools and returns an actual answer. **Always remember to include the full message history (system, user, assistant, tool messages, etc.) on each iteration** – this gives the model context of what has happened so far, including the outcomes of its actions. Missing messages can confuse the model or make it repeat tool calls incorrectly.

6. **Produce Final Answer:** Once the loop ends, the latest assistant message is a normal answer intended for the user. In our CLI, we’ll take `message.content` and print it out in the chat UI as the assistant’s reply. For our file editor agent, this answer should be a **natural language summary of the performed changes** or the result of the user’s query. If the user asked a question about file content, it might be an answer extracted from the file. If the user asked to modify a file, the answer might confirm success. The exact wording is left to the LLM, but you can guide it (via the system prompt) to be concise and explanatory. For instance, a system instruction might say: *“After using tools, respond with a brief summary of the actions taken.”* This helps ensure a good user experience.

**Example:** Suppose the user says: *“Create a file `greeting.txt` with the text Hello, OpenAI!”*

* The LLM sees it has `writeFile` available, so it responds with a tool call: `{"name": "writeFile", "arguments": "{ \"path\": \"greeting.txt\", \"content\": \"Hello, OpenAI!\"}"}`.
* Our agent parses this and executes `writeFile`, creating the file. We return a result like `{"status": "success", "bytesWritten": 13}` (for example) or simply `"File written successfully."`.
* We add the tool message and call the LLM again with that information. Now the LLM knows the write succeeded. It then produces a final answer such as: *“✅ I created **greeting.txt** with the provided content.”*
* We output that to the terminal for the user. The user sees a confirmation in a friendly tone, and the new file is indeed on disk.

Throughout this loop, the LLM-agent is effectively **stateless between iterations** – it’s not storing data internally beyond what we provide each time. All context comes from the message history we maintain. This makes debugging easier, since we can log the messages at each step to see what the model is thinking (the tool calls act like a peek into the model’s chain-of-thought, albeit in a controlled JSON format).

## Integrating with OpenRouter’s API (TypeScript Usage)

To implement the above loop, you’ll need to interact with the OpenRouter API from Node/TypeScript. OpenRouter’s chat completion endpoint is similar to OpenAI’s, with support for function calling. You can use the official OpenAI Node SDK by pointing its base URL to OpenRouter, or simply use `fetch`/Axios to POST to the OpenRouter endpoint. The request will include our message array and tools. For example, using `fetch`:

```ts
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${OPENROUTER_API_KEY}`
};
const body = {
  model: "openai/gpt-4-0613",   // choose a model that supports function calling
  tools: tools,                // our tools array defined earlier
  messages: messages           // the conversation history
};
const resp = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body) });
const data = await resp.json();
// The structure of data will have resp.choices[0].message, which may include a tool_calls field.
```

In the above, we select a model like GPT-4 (the `-0613` versions of GPT-3.5 and GPT-4 support function calling) or another OpenRouter-supported model that can do tool use. Not all models do, so check OpenRouter’s model list for those with `supported_parameters: tools`. The `tools` parameter in the request is how we pass our function specs. Optionally, OpenRouter allows a `tool_choice` field if you want to manually force tool vs no-tool, but usually `"auto"` is the default behavior (the model decides itself).

**Handling Responses:** The response JSON will include a message from the assistant. If a tool was called, OpenRouter indicates that via a `finish_reason` of `"tool_calls"` and provides an array of `tool_calls` in the message. In our code, after `await resp.json()`, we’d check something like:

```ts
const assistantMsg = data.choices[0].message;
if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
    // model is requesting a function call
    const toolCall = assistantMsg.tool_calls[0];
    // (then proceed to execute as shown in the loop above)
} else {
    // final answer
}
```

Each `tool_call` has an `id` (which we should pass back in the tool response message) and a `function` object with `name` and `arguments` (as a string). Once we execute the function and prepare the tool response message, we then call the API again with the new `messages`. This is essentially how we “return” the function result to the model – by calling the model again with a **new user-turn** that actually contains the function output (though marked as `role: tool`). The OpenRouter documentation emphasizes appending the response to messages and providing the tool result in a message before calling the model for the answer. This is exactly what we do in the loop.

**Streaming Considerations:** In a chat CLI, streaming the assistant’s answer token-by-token can make it feel more responsive. OpenRouter supports streaming responses via SSE (Server-Sent Events) if you set `stream: true` in the request. However, streaming with function calling needs care: you typically don’t stream the function call part (since it’s short JSON), but you might stream the final answer. For simplicity, you can implement this agent loop without streaming (wait for full reply each time). If you want streaming for the final answer, you could detect when `assistantMsg.tool_calls` is null (meaning final content) and then re-request that last step with `stream: true`. Many developers start without streaming, then add it once the logic is working.

Finally, ensure you handle errors and edge cases. The model might request a tool with invalid arguments (e.g. a path that doesn’t exist). In such cases, decide how to respond – maybe feed back an error message as the tool’s content. The model may then choose to apologize to the user or ask for clarification. Always maintain the JSON structure and conversation flow to avoid confusing the LLM.

## Building a Chat-Like CLI with React Ink

With the back-end logic in place, we can focus on the user interface. React Ink allows us to create interactive CLI apps using React components, which is perfect for a chat UI in the terminal. In fact, **OpenAI’s own Codex CLI and Anthropic’s Claude Code CLI leverage React Ink for their terminal interfaces**, showing how you can achieve a polished chat experience in a text console.

Here are the main pieces of our CLI UI:

* **Message List Display:** We’ll create a component to render the conversation messages. Each message can be prefixed by the speaker (“User” or “Assistant”) or some icon, and styled with color for clarity. Ink’s `<Text>` component allows coloring. For example, user messages could be cyan and assistant messages green (just as an example to differentiate). If you prefer a cleaner look, you might omit the “User:” label for the user’s own inputs and just display their text, and only label the assistant responses.

* **Input Box:** To capture user input interactively, we can use the `TextInput` component from the Ink ecosystem (there’s an `ink-text-input` package). This provides a text input field in the terminal where the user can type. We might render this at the bottom of the UI, below the message list. When the user presses Enter, we take the input string and trigger our agent logic.

* **State Management:** We can use React state (e.g. `useState` or `useReducer`) to maintain the list of messages. Initially, it might contain a system message (if we display it) or be empty. Each time the user sends a prompt, we optimistically add their message to the list and then begin the LLM processing. While the LLM is thinking (the API call in progress), we might show a loading indicator – perhaps a spinner component or a simple “\[thinking…]” line from the assistant to indicate activity. Once the assistant’s final answer comes back, we replace or append that into the message list.

* **Running the Loop:** The agent loop described earlier involves multiple API calls if functions are invoked. You would implement this loop in an async function (maybe not directly inside the React component’s render, but triggered by an event). For example, when the user hits Enter:

  1. Add user message to state.
  2. Optionally scroll the view or manage output overflow (Ink can manage output, but keep messages array limited if needed).
  3. Call the async function that handles `openRouterClient.chatCompletion` requests. This function will itself loop as needed for tools. It should update state as it goes: possibly adding a “assistant is calling tool X…” message in debug mode, but you might choose not to display internal tool messages to the user. Typically, a product would hide the raw tool JSON and just show the end result. Since our deliverable is a user-friendly editor assistant, we likely **do not show the raw function call and tool response messages** on the UI; those stay under the hood. Instead, only the final assistant answer is shown to the user.

     * *However*, for transparency or debugging, you could show intermediate steps in a subtle way (e.g., log to console, or if this is a developer tool, perhaps in a debug panel). Many CLI agents keep the user informed like, “🤖 (Agent is reading *notes.txt*…)” then “🤖 (Agent has updated *notes.txt*.)” before the final answer. Such UX touches can reassure the user that something is happening and what actions were taken.
  4. As each step completes, you might update a state variable for “assistant thinking” vs “ready”. Ink can re-render the UI on state changes, so you could conditionally show a spinner when waiting for a response.

* **Continuous Conversation:** After the assistant responds, the user should be able to type another prompt to continue the conversation (perhaps asking follow-ups like “What’s in that file?” or “Now delete that file.”). Because we’re maintaining the `messages` state, the context will carry over. The LLM will remember prior instructions and results as long as they remain in the messages list (bounded by model token limits). If you want each query isolated, you could reset the conversation each time, but a key advantage of a chat interface is context carryover. For example:

  * User: *“Create file `a.txt` with content 42.”*
  * Assistant: *“Created `a.txt`.”*
  * User: *“Read `a.txt` and multiply its number by 10.”*
  * The assistant still has context that `a.txt` contains "42" from earlier (assuming we included that info or it can re-read it), and can respond *“The file’s number 42 multiplied by 10 is 420.”* (This might involve it calling `readFile` again, then doing math itself.)

  So, design your loop to append new user queries and keep the history. You might implement a `/clear` command or something if the user wants to reset context. In our UI, after a response is shown, simply leave the `TextInput` ready for the next user prompt.

* **UX Polishing:** A chat in the terminal can incorporate nice touches. For example:

  * Use **colors and text styles** to differentiate roles or highlight file names in responses.
  * Word-wrap long texts so they don’t overflow badly (Ink’s `<Box>` with a specified width or using `wrap` on Text can help).
  * Perhaps display a different prompt symbol for the input (like `>` or `You:` label).
  * Handle resize events if the terminal changes size (Ink usually handles basic wrapping).
  * If an output (like file content) is very large, you might truncate or paginate it to avoid flooding the terminal. The assistant can be instructed to summarize if needed instead of dumping huge contents.
  * Make sure to catch errors from the backend logic and display them nicely (e.g. if the OpenRouter API call fails or a function throws, show an error message in the conversation).

**Real-world Inspiration:** Many CLI-based AI assistants have emerged recently. For instance, *Aider* is an open-source tool that lets you chat with GPT-4 about a codebase and apply changes to files via the terminal. Amazon’s recently introduced *Q* CLI (Agent mode in Warp) can execute multi-step shell and file operations based on plain English commands. The **Pieces CLI Agent** is another example that allows chatting with an LLM to manage code snippets and files from the terminal. All these tools share similar patterns: they accept natural language, use an LLM to figure out the steps, execute file or system actions, and then present results back to the user in a conversational format. By using React Ink, we can achieve a polished interface comparable to these – Ink even supports rendering components like spinners, selectable lists, etc., if you want to extend functionality.

Notably, OpenAI’s Codex CLI and Anthropic’s Claude Code (AI coding assistants run in the terminal) both use a chat UX with agentic capabilities. They found that using a React Ink interface made the terminal feel almost like a GUI app, with text streaming and nicely formatted code blocks, etc. (the adoption of Ink by those projects is a testament to its power). For our implementation, since we focus on file editing, ensure that responses from the assistant are clear about what files were affected. For example, the assistant might say, “I created the file **greeting.txt** and wrote the provided content into it.” As a further UX enhancement, you could even add a feature where the assistant’s message is syntax-highlighted if it returns code or JSON – for instance, if the user asks to see the content of a JSON file, the assistant’s answer (the file content) could be colorized. There are Ink-compatible libraries or you can manually colorize strings for such effect.

## Putting It All Together – Example Workflow

Let’s recap with an illustrative run-through of our CLI agent in action:

* **User input:** The developer types:
  `> Please find the file "report.md", add the line "Conclusion: All tests passed." at the end, and then show me the last 2 lines.`

* **LLM decides on tools:** Based on this request, the LLM determines it needs to use tools:

  1. Likely call `readFile("report.md")` to get the current content (to avoid overwriting or duplicating content when appending).
  2. Then call `updateFile("report.md", contentToAppend)` – assuming we designed `updateFile` to append text. Alternatively, it might directly call a `writeFile` with the new combined content (read + append in one go). Let’s assume it uses `readFile` then `writeFile` for clarity.
  3. After updating, it might call `readFile("report.md")` again to get the last lines (unless it tracked the content internally and can answer without reading – but safer is to read to be sure of final state).

  So, the assistant’s first response might be a **function call**: `{"name": "readFile", "arguments": "{ \"path\": \"report.md\"}"}`. This comes with `finish_reason: "tool_calls"` in the API response, signaling it's not answering yet.

* **CLI executes tool:** Our agent sees the tool request, executes `readFile`. Suppose `report.md` exists and ends with the line "Results: All tests passed." currently. We get the content and append a tool message with that content (or truncated if large).

* **LLM next step:** We call LLM again. Now it has the content of the file. The model figures out it should append the new line. It outputs another function call: `{"name": "writeFile", "arguments": "{ \"path\": \"report.md\", \"content\": \"<full file content with new line added>\"}"}`. Notice it sent the entire updated content as the argument (this is a possible approach; alternatively, `updateFile` with just the new line might have been used, but GPT might choose to send the full content to ensure correctness). This is another `tool_call`, so the loop continues.

* **CLI executes second tool:** Our code writes the file with the new content. We append a tool message confirming success (maybe content is empty or a short confirmation).

* **LLM final step:** We call the LLM again with the info that the write succeeded. Now the LLM sees that the file has the new line. The user also wanted the last 2 lines. The model can either (a) just provide them from its memory of the content, or (b) call `readFile` again. If it calls again to be sure, that’s one more tool call which we execute (reading the updated file) and feed back. Finally, the LLM composes the answer: for example:

  **Assistant:** *“I’ve appended the line to **report.md**. The last two lines of the file are now:
  \n*... (it would quote the actual last two lines) ...*”*.

  This message comes with no further tool calls (finish\_reason “stop”), so the agent loop ends.

* **UI output:** The conversation displayed might look like:

  ```
  You: Please find the file "report.md", add "Conclusion: All tests passed." at the end, and then show me the last 2 lines.
  Assistant: ✅ I found **report.md** and added *"Conclusion: All tests passed."* to the end. Here are the last two lines of the file now:
  Assistant: "Results: All tests passed."
  Assistant: "Conclusion: All tests passed."
  ```

  (The assistant’s answer is split into lines for readability; in a real UI, it might format it as a single message with line breaks. We could even detect that it’s showing file lines and format them differently.)

This example demonstrates an agentic multi-turn operation: the LLM made multiple function calls and used their results to fulfill a complex user request – all in one seamless interaction. The user only saw the final outcome, not the JSON calls or the content passing back and forth. From their perspective, the AI assistant just *did* what they asked, step by step, and reported the result.

## Best Practices and Considerations

Finally, let’s summarize some best practices and design considerations when building your LLM-driven CLI agent:

* **Use a Guiding System Prompt:** It’s often useful to include a system message at the start of your `messages`. For example: *“You are a file assistant. You can read, write, update, or delete files using the provided tools. Respond with a summary of changes or answer the user’s query. If a request is unclear or you encounter an error, politely ask for clarification or report the issue.”* This sets the tone and instructions for the AI. It can reduce hallucinations and ensure the AI knows how to use the tools responsibly. OpenAI models are trained to follow system instructions diligently. In our case, we emphasize using tools for file actions and summarizing results to the user.

* **Validate Model Outputs:** Even with function calling, there’s a chance the model produces an invalid tool call (wrong args types, calling a tool that’s not available, etc.). Validate the `function.arguments` against your schema (you can use a JSON Schema validator if needed). OpenRouter will enforce the JSON schema to some extent, but double-check on your side if the arguments make sense (e.g., path not empty). This prevents dangerous or nonsensical operations. Never execute a tool blindly without inspecting what it’s about to do.

* **Constrain File Operations:** Since the agent can modify files, think about sandboxing. For example, restrict file access to a specific directory so it can’t read/write arbitrary system files. The simplest way is to enforce that in your tool functions (e.g., prepend a base directory or reject paths containing `..`). This is a safety measure. Also consider version controlling the directory (like a git repo) so changes can be tracked or reverted if needed.

* **Manage Errors Gracefully:** If a tool function throws an error (file not found, permission denied, etc.), catch it and return an error message as the tool’s content. For instance, `{"error": "File not found"}`. The LLM will see that and (ideally) handle it in its next response (maybe telling the user the file wasn’t found). This is better than crashing the whole program. Designing the format of error outputs (consistent JSON structure) can help the AI recognize and convey them. You might note in the function description something like “This function returns an error message if the file can’t be read” to set expectations.

* **Token Limit Management:** Each round-trip to the LLM must include the conversation history. If the user has a long session or if files are large, you risk hitting the model’s context length limit. Some strategies:

  * Limit how much of a file you return in `readFile` (maybe only a preview or last N lines if user didn’t explicitly ask for full content).
  * Summarize or truncate past messages if they get too long (OpenAI models don’t do automatic summary in function calling mode, so you may implement a rolling context or remove older turns if not needed).
  * The user’s prompt plus file content plus other messages should ideally stay under a few thousand tokens for reliability.
  * If a file is huge and the user wants an operation, consider telling the user it’s too large, or stream it to the file system in chunks (advanced use case).

* **User Experience:** Make the CLI pleasant to use:

  * Provide **help text or usage instructions** if the user runs the CLI with `--help` or without arguments. Since we built a chat, document how to start the session (maybe just running the binary enters the interactive loop). If using Commander/Yargs for CLI, integrate that with Ink.
  * Possibly support commands like `/exit` to quit, `/new` to start a new session (clearing context), etc.
  * Keep the visual formatting consistent. For example, if the assistant is listing changes or file lines, maybe prefix them with a symbol or indentation for clarity.
  * Respect the user’s terminal capabilities – e.g., if running on Windows vs Unix, ensure any path handling or output coloring works (Ink abstracts most of this).
  * Testing the CLI in different scenarios (small vs large content, consecutive operations, error conditions) will help refine the UX.

* **Logging and Debugging:** During development, log each API call and response (at least in verbose mode) to see what the model is doing. You can print the `tool_calls` and such to your console (or a log file) to trace the agent’s decision process. This can be invaluable if the agent is not behaving as expected (e.g., calling the wrong tool or looping unnecessarily). Once stable, you can silence these logs or put them behind a debug flag.

* **Modern LLM Patterns:** We leveraged “function calling” which is a new yet robust pattern to get structured output from LLMs. This dramatically reduces the need for brittle string parsing and increases reliability of the agent. Always prefer structured outputs for tools when available. Also keep an eye on features like **structured outputs enforcement** (OpenRouter can enforce a JSON schema on the final answer too, if you want the summary in a particular JSON format, for example, though in a chat CLI we usually want free-form text). Using these features aligns with best practices in LLM development circa 2024-2025.

Building an agentic CLI is a cutting-edge way to make LLMs truly interactive and useful in developer workflows. By combining OpenRouter’s powerful tool-calling interface with a React Ink front-end, we get the best of both worlds: the **brains** (GPT-4, etc. orchestrating complex tasks across multiple function calls) and the **looks** (a smooth, user-friendly terminal UI for conversation). The approach outlined here is comprehensive and modular – you can extend it by adding more tools (for example, a `searchText` function to grep within files, or a `runTests` function to execute a test suite, etc., turning your CLI into a full dev assistant). As long as you describe the tool and handle the loop logic, the LLM can leverage it.

In summary, this agent will behave like an AI pair programmer or assistant living in your terminal: it listens, it acts (through the tools), and it explains. By following the patterns and best practices above, you’ll ensure it does so effectively and safely. Happy coding with your new LLM-powered CLI agent!&#x20;

**Sources:** The implementation draws on OpenRouter’s tool-calling documentation for agent loops, real-world CLI agent examples (OpenAI Codex CLI, Claude Code, Aider, Pieces CLI) for design cues, and OpenAI’s function calling best practices for reliable tool integration.
