import * as Eff from '../src'
import * as Msg from '../src/msg'

type Resource = {
    open: () => void
    get: () => number
    close: () => void
}

class LogMsg extends Msg.Msg('Log')<string> {}
class ConfigMsg extends Msg.Msg('Config')<{ apiKey: string }> {}
class ResourceMsg extends Msg.Msg('Resource')<Resource> {}
class TestMsg extends Msg.Msg('Test')<string> {}

describe('Msg.communicate', () => {
    it('should handle basic message send and receive', () => {
        class Greeting extends Msg.Msg('Greeting')<string> {}

        function* sender() {
            yield* Msg.send(new Greeting('Hello, World!'))
            return 'sent'
        }

        function* receiver() {
            const message = yield* Msg.wait(Greeting)
            return `received: ${message}`
        }

        const result = Eff.run(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'sent',
            receiver: 'received: Hello, World!',
        })
    })

    it('should handle Msg.send and Msg.wait syntax', () => {
        class DataMsg extends Msg.Msg('Data')<{ id: number; value: string }> {}

        function* producer() {
            yield* Msg.send(new DataMsg({ id: 1, value: 'test data' }))
            return 'produced'
        }

        function* consumer() {
            const data = yield* Msg.wait(DataMsg)
            return `consumed: ${data.id} - ${data.value}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                producer,
                consumer,
            }),
        )

        expect(result).toEqual({
            producer: 'produced',
            consumer: 'consumed: 1 - test data',
        })
    })

    it('should handle multiple messages between generators', () => {
        class Request extends Msg.Msg('Request')<string> {}
        class Response extends Msg.Msg('Response')<string> {}

        function* client() {
            yield* Msg.send(new Request('get user data'))
            const response = yield* Msg.wait(Response)
            return `client: ${response}`
        }

        function* server() {
            const request = yield* Msg.wait(Request)
            yield* Msg.send(new Response(`processed: ${request}`))
            return `server: handled ${request}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                client,
                server,
            }),
        )

        expect(result).toEqual({
            client: 'client: processed: get user data',
            server: 'server: handled get user data',
        })
    })

    it('should handle complex message passing scenarios', () => {
        class UserRequest extends Msg.Msg('UserRequest')<{ userId: string }> {}
        class UserResponse extends Msg.Msg('UserResponse')<{ user: { id: string; name: string } }> {}
        class LogMessage extends Msg.Msg('Log')<string> {}

        function* apiClient() {
            yield* Msg.send(new UserRequest({ userId: '123' }))
            const userResponse = yield* Msg.wait(UserResponse)
            yield* Msg.send(new LogMessage(`Retrieved user: ${userResponse.user.name}`))
            return `API client: ${userResponse.user.name}`
        }

        function* apiServer() {
            const request = yield* Msg.wait(UserRequest)
            yield* Msg.send(new LogMessage(`Processing request for user: ${request.userId}`))
            yield* Msg.send(new UserResponse({ user: { id: request.userId, name: 'John Doe' } }))
            return `API server: processed ${request.userId}`
        }

        function* logger() {
            const log1 = yield* Msg.wait(LogMessage)
            const log2 = yield* Msg.wait(LogMessage)
            return `Logger: ${log1}, ${log2}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                apiClient,
                apiServer,
                logger,
            }),
        )

        expect(result).toEqual({
            apiClient: 'API client: John Doe',
            apiServer: 'API server: processed 123',
            logger: 'Logger: Processing request for user: 123, Retrieved user: John Doe',
        })
    })

    it('should handle mixed message passing syntax', () => {
        class Status extends Msg.Msg('Status')<{ status: string; timestamp: number }> {}

        function* worker1() {
            yield* Msg.send(new Status({ status: 'working', timestamp: Date.now() }))
            const status = yield* Msg.wait(Status)
            return `worker1: saw ${status.status}`
        }

        function* worker2() {
            const status = yield* Msg.wait(Status)
            yield* Msg.send(new Status({ status: 'done', timestamp: Date.now() }))
            return `worker2: processed ${status.status}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                worker1,
                worker2,
            }),
        )

        expect(result.worker1).toMatch(/worker1: saw done/)
        expect(result.worker2).toMatch(/worker2: processed working/)
    })

    it('should handle async message passing', async () => {
        class AsyncData extends Msg.Msg('AsyncData')<string> {}

        function* asyncProducer() {
            const data = yield* Eff.await(Promise.resolve('async data'))
            yield* Msg.send(new AsyncData(data))
            return 'async produced'
        }

        function* asyncConsumer() {
            const data = yield* Msg.wait(AsyncData)
            const processed = yield* Eff.await(Promise.resolve(`processed: ${data}`))
            return processed
        }

        const result = await Eff.runAsync(
            Msg.communicate({
                asyncProducer,
                asyncConsumer,
            }),
        )

        expect(result).toEqual({
            asyncProducer: 'async produced',
            asyncConsumer: 'processed: async data',
        })
    })

    it('should throw error for unmatched messages', () => {
        class TestMsg extends Msg.Msg('Test')<string> {}

        function* sender() {
            yield* Msg.send(new TestMsg('message'))
            return 'sent'
        }

        function* receiver() {
            return 'received'
        }

        expect(() =>
            Eff.runSync(
                Msg.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test' sent by 'sender' was not received/)
    })

    it('should support send message of undefined type', () => {
        class TestMsg extends Msg.Msg('Test')<void> {}

        function* sender() {
            yield* Msg.send(new TestMsg())
            return 'sent'
        }

        function* receiver() {
            yield* Msg.wait(TestMsg)
            return `received`
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'sent',
            receiver: 'received',
        })
    })

    it('should throw error for unsent messages', () => {
        class TestMsg extends Msg.Msg('Test')<string> {}

        function* sender() {
            return 'sent'
        }

        function* receiver() {
            yield* Msg.wait(TestMsg)
            return 'received'
        }

        expect(() =>
            Eff.runSync(
                Msg.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test' waited by 'receiver' was not sent/)
    })

    it('should throw specific error messages for unmatched send/wait pairs', () => {
        class Test1Msg extends Msg.Msg('Test1')<string> {}
        class Test2Msg extends Msg.Msg('Test2')<string> {}

        function* sender1() {
            yield* Msg.send(new Test1Msg('message1'))
            return 'sent1'
        }

        function* sender2() {
            yield* Msg.send(new Test2Msg('message2'))
            return 'sent2'
        }

        function* receiver() {
            const msg1 = yield* Msg.wait(Test1Msg)
            // Missing wait for Test2
            return `received: ${msg1}`
        }

        expect(() =>
            Eff.runSync(
                Msg.communicate({
                    sender1,
                    sender2,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test2' sent by 'sender2' was not received/)
    })

    it('should handle multiple unmatched messages correctly', () => {
        class Test1Msg extends Msg.Msg('Test1')<string> {}
        class Test2Msg extends Msg.Msg('Test2')<string> {}

        function* sender() {
            yield* Msg.send(new Test1Msg('message1'))
            yield* Msg.send(new Test2Msg('message2'))
            return 'sent'
        }

        function* receiver() {
            // Only waiting for one message, leaving the other unmatched
            const msg = yield* Msg.wait(Test1Msg)
            return `received: ${msg}`
        }

        expect(() =>
            Eff.runSync(
                Msg.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test2' sent by 'sender' was not received/)
    })

    it('should handle generator inputs', () => {
        class GreetingMsg extends Msg.Msg('Greeting')<string> {}

        const sender = function* () {
            yield* Msg.send(new GreetingMsg('Hello'))
            return 'sent'
        }

        const receiver = function* () {
            const msg = yield* Msg.wait(GreetingMsg)
            return `received: ${msg}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender: sender(),
                receiver: receiver(),
            }),
        )

        expect(result).toEqual({
            sender: 'sent',
            receiver: 'received: Hello',
        })
    })

    it('should handle mixed function and generator inputs', () => {
        class DataMsg extends Msg.Msg('Data')<{ value: number }> {}

        function* producer() {
            yield* Msg.send(new DataMsg({ value: 100 }))
            return 'produced'
        }

        const consumer = function* () {
            const data = yield* Msg.wait(DataMsg)
            return `consumed: ${data.value}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                producer: producer(),
                consumer,
            }),
        )

        expect(result).toEqual({
            producer: 'produced',
            consumer: 'consumed: 100',
        })
    })

    it('should handle complex nested message passing', () => {
        class CommandMsg extends Msg.Msg('Command')<{ cmd: string; args: string[] }> {}
        class ResultMsg extends Msg.Msg('Result')<{ success: boolean; data: any }> {}

        function* commandProcessor() {
            const command = yield* Msg.wait(CommandMsg)
            yield* Msg.send(new LogMsg(`Processing command: ${command.cmd}`))

            if (command.cmd === 'calculate') {
                const result = command.args.reduce((sum, arg) => sum + parseInt(arg, 10), 0)
                yield* Msg.send(new ResultMsg({ success: true, data: result }))
            } else {
                yield* Msg.send(new ResultMsg({ success: false, data: 'Unknown command' }))
            }

            return `processed: ${command.cmd}`
        }

        function* commandClient() {
            yield* Msg.send(new CommandMsg({ cmd: 'calculate', args: ['1', '2', '3'] }))
            const result = yield* Msg.wait(ResultMsg)
            yield* Msg.send(new LogMsg(`Command result: ${result.success ? result.data : result.data}`))
            return `client: ${result.data}`
        }

        function* logger() {
            const log1 = yield* Msg.wait(LogMsg)
            const log2 = yield* Msg.wait(LogMsg)
            return `Logger: ${log1} | ${log2}`
        }

        const result = Eff.runSync(
            Msg.communicate({
                commandProcessor,
                commandClient,
                logger,
            }),
        )

        expect(result).toEqual({
            commandProcessor: 'processed: calculate',
            commandClient: 'client: 6',
            logger: 'Logger: Processing command: calculate | Command result: 6',
        })
    })

    it('should handle message passing with context', () => {
        class UserCtx extends Eff.Ctx('User')<{ id: string; name: string }> {}

        function* configProvider() {
            yield* Msg.send(new ConfigMsg({ apiKey: 'secret-key' }))
            return 'config provided'
        }

        function* service() {
            const config = yield* Msg.wait(ConfigMsg)
            const user = yield* Eff.get(UserCtx)
            return `service: ${user.name} with key ${config.apiKey.slice(0, 5)}...`
        }

        const program = Eff.try(
            Msg.communicate({
                configProvider,
                service,
            }),
        ).handle({
            User: { id: '1', name: 'Alice' },
        })

        const result = Eff.runSync(program)

        expect(result).toEqual({
            configProvider: 'config provided',
            service: expect.stringContaining('Alice'),
        })
    })

    it('should handle message passing with error handling', () => {
        class ValidationError extends Eff.Err('ValidationError')<string> {}

        class RequestMsg extends Msg.Msg('Request')<{ id: string }> {}
        class ResponseMsg extends Msg.Msg('Response')<{ success: boolean; data?: any; error?: string }> {}

        function* validator() {
            const request = yield* Msg.wait(RequestMsg)

            if (!request.id || request.id.length < 3) {
                yield* Msg.send(
                    new ResponseMsg({
                        success: false,
                        error: 'Invalid ID',
                    }),
                )
                yield* Eff.throw(new ValidationError('ID validation failed'))
                return 'validation failed'
            }

            yield* Msg.send(
                new ResponseMsg({
                    success: true,
                    data: { id: request.id, status: 'valid' },
                }),
            )
            return 'validation passed'
        }

        function* client() {
            yield* Msg.send(new RequestMsg({ id: 'ab' }))
            const response = yield* Msg.wait(ResponseMsg)
            return `client: ${response.success ? response.data?.status : response.error}`
        }

        const program0 = Msg.communicate({
            validator,
            client,
        })

        const program = Eff.try(program0).handle({
            ValidationError: (error) => `Handled: ${error}`,
        })

        const result = Eff.runSync(program)

        expect(result).toEqual('Handled: ID validation failed')
    })

    it('should allow generators to catch send/wait errors with try-catch', () => {
        function* sender() {
            try {
                yield* Msg.send(new TestMsg('message'))
                return 'sent successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'caught send error: message not received'
                }
                throw error
            }
        }

        function* receiver() {
            return 'received without waiting'
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'caught send error: message not received',
            receiver: 'received without waiting',
        })
    })

    it('should allow generators to catch wait errors with try-catch', () => {
        function* sender() {
            return 'sent nothing'
        }

        function* receiver() {
            try {
                const message = yield* Msg.wait(TestMsg)
                return `received: ${message}`
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not sent')) {
                    return 'caught wait error: message not sent'
                }
                throw error
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'sent nothing',
            receiver: 'caught wait error: message not sent',
        })
    })

    it('should handle multiple generators with error catching', () => {
        class Test1Msg extends Msg.Msg('Test1')<string> {}
        class Test2Msg extends Msg.Msg('Test2')<string> {}

        function* sender1() {
            try {
                yield* Msg.send(new Test1Msg('message1'))
                return 'sent1 successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'sender1 caught error'
                }
                throw error
            }
        }

        function* sender2() {
            try {
                yield* Msg.send(new Test2Msg('message2'))
                return 'sent2 successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'sender2 caught error'
                }
                throw error
            }
        }

        function* receiver() {
            try {
                const msg1 = yield* Msg.wait(Test1Msg)
                return `received: ${msg1}`
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not sent')) {
                    return 'receiver caught error'
                }
                throw error
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender1,
                sender2,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender1: 'sent1 successfully',
            sender2: 'sender2 caught error',
            receiver: 'received: message1',
        })
    })

    it('should continue processing after gen.throw and clear queue', () => {
        let processedCount = 0

        function* sender() {
            try {
                yield* Msg.send(new TestMsg('message'))
                processedCount++
                return 'sent'
            } catch (error) {
                processedCount++
                return 'caught send error'
            }
        }

        function* receiver() {
            try {
                const message = yield* Msg.wait(TestMsg)
                processedCount++
                return `received: ${message}`
            } catch (error) {
                processedCount++
                return 'caught wait error'
            }
        }

        function* extraGenerator() {
            processedCount++
            return 'extra processed'
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
                extraGenerator,
            }),
        )

        // All generators should be processed, even after errors
        expect(processedCount).toBe(3)
        expect(result).toHaveProperty('sender')
        expect(result).toHaveProperty('receiver')
        expect(result).toHaveProperty('extraGenerator')
    })

    it('should allow continuing send/wait after catching errors', () => {
        function* sender() {
            try {
                yield* Msg.send(new TestMsg('message1'))
                return 'sent1 successfully'
            } catch (error) {
                // Continue sending other messages after catching error
                yield* Msg.send(new TestMsg('message2'))
                return 'sent2 after error'
            }
        }

        function* receiver() {
            try {
                const msg1 = yield* Msg.wait(TestMsg)
                return `received1: ${msg1}`
            } catch (error) {
                // Continue waiting for other messages after catching error
                const msg2 = yield* Msg.wait(TestMsg)
                return `received2: ${msg2}`
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result).toEqual({
            sender: 'sent1 successfully',
            receiver: 'received1: message1',
        })
    })

    it('should handle multiple send/wait operations after error recovery', () => {
        class Test1Msg extends Msg.Msg('Test1')<string> {}
        class Test2Msg extends Msg.Msg('Test2')<string> {}
        class Test3Msg extends Msg.Msg('Test3')<string> {}
        class Test4Msg extends Msg.Msg('Test4')<string> {}
        class Test5Msg extends Msg.Msg('Test5')<string> {}

        function* sender() {
            try {
                yield* Msg.send(new Test1Msg('message1'))
                yield* Msg.send(new Test2Msg('message2'))
                return 'sent both successfully'
            } catch (error) {
                // Send multiple messages after catching error
                yield* Msg.send(new Test3Msg('message3'))
                yield* Msg.send(new Test4Msg('message4'))
                yield* Msg.send(new Test5Msg('message5'))
                return 'sent three after error'
            }
        }

        function* receiver() {
            const messages = []
            try {
                const msg1 = yield* Msg.wait(Test1Msg)
                messages.push(msg1)
                const msg2 = yield* Msg.wait(Test2Msg)
                messages.push(msg2)
                return `received: ${messages.join(', ')}`
            } catch (error) {
                // Wait for multiple messages after catching error
                const msg3 = yield* Msg.wait(Test3Msg)
                messages.push(msg3)
                const msg4 = yield* Msg.wait(Test4Msg)
                messages.push(msg4)
                const msg5 = yield* Msg.wait(Test5Msg)
                messages.push(msg5)
                return `received after error: ${messages.join(', ')}`
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result).toEqual({
            sender: 'sent both successfully',
            receiver: 'received: message1, message2',
        })
    })

    it('should implement log collection with try-finally', () => {
        function* logger() {
            const logs = []
            try {
                // Continuously wait for log messages without matching count
                while (true) {
                    const log = yield* Msg.wait(LogMsg)
                    logs.push(log)
                }
            } finally {
                // eslint-disable-next-line no-unsafe-finally
                return `Collected logs: ${logs.join(' | ')}`
            }
        }

        function* producer1() {
            yield* Msg.send(new LogMsg('Producer1: Started'))
            yield* Msg.send(new LogMsg('Producer1: Processing'))
            yield* Msg.send(new LogMsg('Producer1: Completed'))
            return 'producer1 done'
        }

        function* producer2() {
            yield* Msg.send(new LogMsg('Producer2: Started'))
            yield* Msg.send(new LogMsg('Producer2: Error occurred'))
            return 'producer2 done'
        }

        const result = Eff.runSync(
            Msg.communicate({
                logger,
                producer1,
                producer2,
            }),
        )

        expect(result.logger).toBe(
            'Collected logs: Producer1: Started | Producer1: Processing | Producer1: Completed | Producer2: Started | Producer2: Error occurred',
        )
        expect(result.producer1).toBe('producer1 done')
        expect(result.producer2).toBe('producer2 done')
    })

    it('should implement shared resources and cleanup correctly', () => {
        class ResourceCtx extends Eff.Ctx('Resource')<Resource> {}

        function* resourceProvider() {
            const resource = yield* Eff.get(ResourceCtx)
            let count = 0
            try {
                resource.open()
                while (true) {
                    yield* Msg.send(new ResourceMsg(resource))
                    count++
                }
            } finally {
                resource.close()
                // eslint-disable-next-line no-unsafe-finally
                return count
            }
        }

        function* getResource() {
            const resource = yield* Msg.wait(ResourceMsg)
            return resource.get()
        }

        function* consumer1() {
            const n = yield* getResource()

            return n
        }

        function* consumer2() {
            const n = yield* getResource()

            return n
        }

        function* consumer3() {
            const n = yield* getResource()

            return n
        }

        const logs = [] as string[]
        let count = 0

        const program = Eff.try(
            Msg.communicate({
                resource: resourceProvider,
                consumer1,
                consumer2,
                consumer3,
            }),
        ).handle({
            Resource: {
                open: () => logs.push('Resource: open'),
                get: () => {
                    logs.push('Resource: get')
                    return count++
                },
                close: () => logs.push('Resource: close'),
            },
        })

        const result = Eff.runSync(program)

        expect(logs).toEqual(['Resource: open', 'Resource: get', 'Resource: get', 'Resource: get', 'Resource: close'])
        expect(result).toEqual({
            resource: 3,
            consumer1: 0,
            consumer2: 1,
            consumer3: 2,
        })
    })

    it('should handle mixed error recovery and log collection', () => {
        function* logger() {
            const logs = []
            try {
                while (true) {
                    const log = yield* Msg.wait(LogMsg)
                    logs.push(log)
                }
            } finally {
                // eslint-disable-next-line no-unsafe-finally
                return `Logs: ${logs.join(' | ')}`
            }
        }

        function* sender() {
            try {
                yield* Msg.send(new TestMsg('message'))
                yield* Msg.send(new LogMsg('Sender: Message sent successfully'))
                return 'sent successfully'
            } catch (error) {
                // Continue sending logs after catching error
                yield* Msg.send(new LogMsg('Sender: Message failed, but continuing'))
                yield* Msg.send(new LogMsg('Sender: Recovery completed'))
                return 'sent after error'
            }
        }

        function* receiver() {
            try {
                const message = yield* Msg.wait(TestMsg)
                yield* Msg.send(new LogMsg('Receiver: Message received'))
                return `received: ${message}`
            } catch (error) {
                yield* Msg.send(new LogMsg('Receiver: Message not received, but continuing'))
                return 'received nothing'
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                logger,
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result.logger).toContain('Sender: Message sent successfully')
        expect(result.logger).toContain('Receiver: Message received')
        expect(result.sender).toBe('sent successfully')
        expect(result.receiver).toBe('received: message')
    })

    it('should demonstrate error recovery with unmatched messages', () => {
        class Test1Msg extends Msg.Msg('Test1')<string> {}
        class Test2Msg extends Msg.Msg('Test2')<string> {}
        class Test3Msg extends Msg.Msg('Test3')<string> {}

        function* sender1() {
            try {
                yield* Msg.send(new Test1Msg('message1'))
                return 'sent1 successfully'
            } catch (error) {
                // Send other messages after catching error
                yield* Msg.send(new Test2Msg('message2'))
                return 'sent2 after error'
            }
        }

        function* sender2() {
            try {
                yield* Msg.send(new Test3Msg('message3'))
                return 'sent3 successfully'
            } catch (error) {
                return 'sent3 failed'
            }
        }

        function* receiver() {
            try {
                const msg2 = yield* Msg.wait(Test2Msg)
                const msg3 = yield* Msg.wait(Test3Msg)
                return `received: ${msg2}, ${msg3}`
            } catch (error) {
                return 'receiver caught error'
            }
        }

        const result = Eff.runSync(
            Msg.communicate({
                sender1,
                sender2,
                receiver,
            }),
        )

        // sender1 will successfully send Test1, then catch Test3's error, then send Test2
        expect(result.sender1).toBe('sent2 after error')
        expect(result.sender2).toBe('sent3 successfully')
        expect(result.receiver).toBe('received: message2, message3')
    })
})
