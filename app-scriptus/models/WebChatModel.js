const mongon = require('@bootloader/mongon');

const webChatSchema = mongon.Schema({
  contactId: {
    type: String,
    required:false,
    index: true  // Create an index on contactId for faster querying
  },
  sessionId : {
    type : String,
    required: true,
    index: true
  },
  rephrasedQuestion : {
    type : String, required : true
  },
  messages: {
    user: {
      type: String,
      required: true
    },
    assistant: {
      type: String,
      required: true
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true  // Create an index on timestamp for efficient time-based queries
  },
  matches: [{
    knowledgebase: {
      type: String
    },
    score: {
      type: Number
    },
    required : false
  }]
}, {
  // Add createdAt and updatedAt timestamps automatically
  timestamps: true , collection : "webchats"
});

module.exports = { webChatSchema };