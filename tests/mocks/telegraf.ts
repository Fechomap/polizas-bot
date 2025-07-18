// Mock completo de Telegraf para testing
import { jest } from '@jest/globals';

const createMockBot = () => ({
    telegram: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
        editMessageText: jest.fn().mockResolvedValue(true),
        getMe: jest.fn().mockResolvedValue({ id: 123, username: 'test_bot' })
    },
    use: jest.fn(),
    command: jest.fn(),
    on: jest.fn(),
    catch: jest.fn(),
    launch: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true)
});

const createMockContext = (overrides: any = {}) => ({
    chat: { id: -123456789, type: 'group' },
    message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        text: '/test',
        from: { id: 12345, username: 'testuser' }
    },
    reply: jest.fn().mockResolvedValue({ message_id: 456 }),
    replyWithMarkdown: jest.fn().mockResolvedValue({ message_id: 457 }),
    editMessageText: jest.fn().mockResolvedValue(true),
    answerCbQuery: jest.fn().mockResolvedValue(true),
    match: null,
    callbackQuery: null,
    ...overrides
});

const createMockCallbackContext = (data: string = 'test_callback', overrides: any = {}) => ({
    ...createMockContext(),
    callbackQuery: {
        id: 'callback_123',
        data,
        message: {
            message_id: 789,
            chat: { id: -123456789 }
        }
    },
    match: data.match(/^(\w+)_(.+)$/) || [data, data, ''],
    ...overrides
});

export {
    Telegraf: jest.fn().mockImplementation(() => createMockBot()),
    Markup: {
        inlineKeyboard: jest
            .fn()
            .mockImplementation((buttons: any) => ({ reply_markup: { inline_keyboard: buttons } })),
        button: {
            callback: jest.fn().mockImplementation((text: string, data: string) => ({ text, callback_data: data }))
        }
    },
    createMockBot,
    createMockContext,
    createMockCallbackContext
};