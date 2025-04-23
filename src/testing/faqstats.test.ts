import { 
    ChatInputCommandInteraction, 
    Client, 
    StringSelectMenuInteraction, 
    EmbedBuilder,
    Collection
} from 'discord.js';
import { DB } from '../../config';
import FAQStatsCommand from '../../src/commands/admin/faqstats';
import { EventEmitter } from 'events';

// Mock discord.js
jest.mock('discord.js', () => {
    const original = jest.requireActual('discord.js');
    return {
        ...original,
        Client: jest.fn().mockImplementation(() => {
            const client = new EventEmitter() as EventEmitter & {
                mongo: { collection: jest.Mock };
                user: { id: string };
                listeners: jest.Mock;
                removeListener: jest.Mock;
                on: jest.Mock;
            };
            client.mongo = { collection: jest.fn() };
            client.user = { id: 'bot123' };
            client.listeners = jest.fn().mockReturnValue([]);
            client.removeListener = jest.fn();
            client.on = jest.fn();
            return client as unknown as Client;
        }),
        EmbedBuilder: jest.fn().mockImplementation(() => ({
            setTitle: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
            setTimestamp: jest.fn().mockReturnThis(),
            addFields: jest.fn().mockReturnThis()
        })),
        ActionRowBuilder: jest.fn().mockImplementation(() => ({
            addComponents: jest.fn().mockReturnThis()
        })),
        StringSelectMenuBuilder: jest.fn().mockImplementation(() => ({
            setCustomId: jest.fn().mockReturnThis(),
            setPlaceholder: jest.fn().mockReturnThis(),
            addOptions: jest.fn().mockReturnThis()
        }))
    };
});

// Mock interactions
const mockReply = jest.fn().mockResolvedValue({});
const mockDeferUpdate = jest.fn().mockResolvedValue({});
const mockEditReply = jest.fn().mockResolvedValue({});
const mockGetString = jest.fn();
const mockGetUser = jest.fn();
const mockGetBoolean = jest.fn();
const mockOptions = {
    getString: mockGetString,
    getUser: mockGetUser,
    getBoolean: mockGetBoolean
};

const mockCommandInteraction = {
    client: null, // Set in tests
    options: mockOptions,
    reply: mockReply,
    user: { id: 'user123', username: 'TestUser' },
    member: { id: 'user123' }
} as unknown as ChatInputCommandInteraction;

const mockSelectInteraction = {
    client: null, // Set in tests
    customId: 'faq_stats_category',
    values: ['test-category'],
    deferUpdate: mockDeferUpdate,
    editReply: mockEditReply,
    isStringSelectMenu: () => true
} as unknown as StringSelectMenuInteraction;

// Mock MongoDB methods
const mockDistinct = jest.fn();
const mockFind = jest.fn();
const mockToArray = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    mockGetString.mockReset();
    mockGetUser.mockReset();
    mockGetBoolean.mockReset();
    mockReply.mockClear();
    mockDeferUpdate.mockClear();
    mockEditReply.mockClear();
    mockDistinct.mockReset();
    mockFind.mockReset();
    mockToArray.mockReset();
});

describe('FAQStats Command', () => {
    let command: FAQStatsCommand;
    let client;
    let embedBuilderInstance;

    beforeEach(() => {
        client = new Client({ intents: [] });
        Object.defineProperty(mockCommandInteraction, 'client', { value: client, writable: true });
        Object.defineProperty(mockSelectInteraction, 'client', { value: client, writable: true });
        
        // Setup MongoDB mock
        mockFind.mockReturnValue({
            toArray: mockToArray
        });
        
        (client.mongo.collection as jest.Mock).mockImplementation((name: string) => {
            if (name === DB.FAQS) {
                return {
                    distinct: mockDistinct
                };
            }
            if (name === DB.CLIENT_DATA) {
                return {
                    find: mockFind
                };
            }
            return {};
        });
        
        command = new FAQStatsCommand();
        
        // Setup mocked embed builder instance
        embedBuilderInstance = {
            setTitle: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
            setTimestamp: jest.fn().mockReturnThis(),
            addFields: jest.fn().mockReturnThis()
        };
        (EmbedBuilder as unknown as jest.Mock).mockReturnValue(embedBuilderInstance);
    });

    describe('getCategories static method', () => {
        it('should return empty array if client is not provided', async () => {
            const categories = await FAQStatsCommand.getCategories(null);
            expect(categories).toEqual([]);
        });

        it('should return categories from database', async () => {
            mockDistinct.mockResolvedValueOnce(['Category1', 'Category2']);
            const categories = await FAQStatsCommand.getCategories(client);
            expect(categories).toEqual(['Category1', 'Category2']);
            expect(mockDistinct).toHaveBeenCalledWith('category');
        });

        it('should filter invalid categories', async () => {
            mockDistinct.mockResolvedValueOnce(['Category1', null, '', 123, 'Category2']);
            const categories = await FAQStatsCommand.getCategories(client);
            expect(categories).toEqual(['Category1', 'Category2']);
        });

        it('should handle errors gracefully', async () => {
            mockDistinct.mockRejectedValueOnce(new Error('Test error'));
            const categories = await FAQStatsCommand.getCategories(client);
            expect(categories).toEqual([]);
        });
    });

    describe('run method', () => {
        it('should handle direct category filter', async () => {
            mockGetString.mockImplementation((param) => {
                if (param === 'timeframe') return 'all';
                if (param === 'category') return 'Test Category';
                return null;
            });
            mockGetUser.mockReturnValue(null);
            mockGetBoolean.mockReturnValue(false);
            
            mockToArray.mockResolvedValueOnce([
                { 
                    _id: 'faq_stats_1', 
                    usageCount: 10, 
                    category: 'Test Category',
                    question: 'Test Question'
                }
            ]);
            
            await command.run(mockCommandInteraction);
            
            expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
                category: 'Test Category'
            }));
            expect(mockReply).toHaveBeenCalled();
        });

        it('should show category selection when no category specified', async () => {
            mockGetString.mockImplementation((param) => {
                if (param === 'timeframe') return 'all';
                return null;
            });
            mockGetUser.mockReturnValue(null);
            mockGetBoolean.mockReturnValue(false);
            
            mockDistinct.mockResolvedValueOnce(['Category1', 'Category2']);
            
            await command.run(mockCommandInteraction);
            
            expect(mockDistinct).toHaveBeenCalled();
            expect(mockReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Select a category'),
                components: expect.any(Array)
            }));
            expect(client.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
        });
    });

    describe('handleFAQAnalytics method', () => {
        it('should display "no stats found" message when no data', async () => {
            mockToArray.mockResolvedValueOnce([]);
            
            // Directly call the private method using any type assertion
            await (command as any).handleFAQAnalytics(
                mockSelectInteraction, 
                'test-category',
                'all',
                null,
                false
            );
            
            expect(mockEditReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('No FAQ usage statistics found')
            }));
        });

        it('should create correct embeds with category filter', async () => {
            mockToArray.mockResolvedValueOnce([
                { 
                    _id: 'faq_stats_1', 
                    usageCount: 10, 
                    category: 'test-category',
                    question: 'Test Question 1',
                    feedback: { positive: 5, negative: 2 },
                    lastUsed: Date.now()
                },
                { 
                    _id: 'faq_stats_2', 
                    usageCount: 5, 
                    category: 'test-category',
                    question: 'Test Question 2',
                    feedback: { positive: 3, negative: 1 },
                    lastUsed: Date.now() - 1000
                }
            ]);
            
            await (command as any).handleFAQAnalytics(
                mockSelectInteraction, 
                'test-category',
                'all',
                null,
                true // Detailed view
            );
            
            expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
                category: 'test-category'
            }));
            expect(mockEditReply).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
            expect(EmbedBuilder).toHaveBeenCalled();
            expect(embedBuilderInstance.setTitle).toHaveBeenCalledWith(
                expect.stringContaining('test-category')
            );
            expect(embedBuilderInstance.addFields).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Total FAQ Usage',
                    value: expect.stringContaining('15 times')
                })
            );
        });

        it('should filter by user correctly', async () => {
            const testUser = { id: 'user123', username: 'TestUser' };
            
            mockToArray.mockResolvedValueOnce([
                { 
                    _id: 'faq_stats_1', 
                    usageCount: 10, 
                    category: 'test-category',
                    question: 'Test Question 1',
                    usageHistory: [
                        { userId: 'user123', timestamp: Date.now() },
                        { userId: 'other-user', timestamp: Date.now() }
                    ]
                }
            ]);
            
            await (command as any).handleFAQAnalytics(
                mockSelectInteraction, 
                'test-category',
                'all',
                testUser,
                false
            );
            
            expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
                'usageHistory.userId': 'user123'
            }));
            expect(mockEditReply).toHaveBeenCalled();
        });

        it('should filter by timeframe correctly', async () => {
            mockToArray.mockResolvedValueOnce([
                { 
                    _id: 'faq_stats_1', 
                    usageCount: 10, 
                    category: 'test-category',
                    question: 'Test Question 1',
                    lastUsed: Date.now()
                }
            ]);
            
            await (command as any).handleFAQAnalytics(
                mockSelectInteraction, 
                'test-category',
                'week', // Past week
                null,
                false
            );
            
            expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
                lastUsed: expect.any(Object)
            }));
            expect(mockEditReply).toHaveBeenCalled();
        });
    });
}); 