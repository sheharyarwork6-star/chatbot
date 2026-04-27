import { User, Bot } from 'lucide-react';

const ChatMessage = ({ message }) => {
    const isUser = message.role === 'user';

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4 sm:mb-6 animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`flex max-w-[90%] sm:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2 sm:gap-4 items-end`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full shadow-lg border border-gray-700
          ${isUser ? 'bg-blue-600 ml-2 sm:ml-4' : 'bg-gray-800 mr-2 sm:mr-4'}`}>
                    {isUser ? <User size={16} className="sm:w-5 sm:h-5" /> : <Bot size={16} className="sm:w-5 sm:h-5 text-blue-400" />}
                </div>

                {/* Message Bubble */}
                <div className={`relative px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl shadow-md text-sm sm:text-[15px] leading-relaxed
          ${isUser
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-[#1f2937] text-gray-100 rounded-bl-sm border border-gray-700 shadow-[0_0_15px_-3px_rgba(0,0,0,0.5)]'
                    }`}
                >
                    {message.content}
                </div>
            </div>
        </div>
    );
};

export default ChatMessage;
