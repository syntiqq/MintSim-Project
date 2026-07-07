// Sent once by the Collection right after deploying this NftItem.
message MintTransfer {
    queryId: Int as uint64;
    owner:   Address;
    content: Cell;
}

// Standard TEP-62 NFT transfer
message(0x5fcc3d14) Transfer {
    queryId:             Int as uint64;
    newOwner:            Address;
    responseDestination: Address?;
    customPayload:       Cell?;
    forwardAmount:       Int as coins;
    forwardPayload:      Slice as remaining;
}

message(0x05138d91) OwnershipAssigned {
    queryId:        Int as uint64;
    prevOwner:      Address;
    forwardPayload: Slice as remaining;
}

message(0xd53276db) Excesses {
    queryId: Int as uint64;
}

message(0x2fcb26a2) GetStaticData {
    queryId: Int as uint64;
}

message(0x8b771735) ReportStaticData {
    queryId:    Int as uint64;
    index:      Int as uint64;
    collection: Address;
}

struct NftData {
    init:       Bool;
    index:      Int as uint64;
    collection: Address;
    owner:      Address;
    content:    Cell;
}

//  NftItem contract

contract NftItem {

    collection:  Address;
    index:       Int as uint64;
    owner:       Address;
    content:     Cell;
    initialized: Bool;

    init(collection: Address, index: Int) {
        self.collection  = collection;
        self.index       = index;
        self.owner       = collection;   // placeholder owner until minted
        self.content     = emptyCell();
        self.initialized = false;
    }

    // Called exactly once, by the Collection, right after deploy.
    receive(msg: MintTransfer) {
        require(!self.initialized, "Already initialized");
        require(sender() == self.collection, "Only collection can mint");

        self.initialized = true;
        self.owner       = msg.owner;
        self.content     = msg.content;
    }

    receive(msg: Transfer) {
        require(self.initialized, "Not minted yet");
        require(sender() == self.owner, "Only owner can transfer");

        let prevOwner: Address = self.owner;
        self.owner = msg.newOwner;

        if (msg.responseDestination != null) {
            send(SendParameters{
                to:     msg.newOwner,
                value:  0,
                mode:   SendIgnoreErrors,
                bounce: false,
                body: OwnershipAssigned{
                    queryId:        msg.queryId,
                    prevOwner:      prevOwner,
                    forwardPayload: msg.forwardPayload
                }.toCell()
            });

            send(SendParameters{
                to:     msg.responseDestination!!,
                value:  0,
                mode:   SendRemainingValue,
                bounce: false,
                body: Excesses{ queryId: msg.queryId }.toCell()
            });
        }
    }

    receive(msg: GetStaticData) {
        send(SendParameters{
            to:     sender(),
            value:  0,
            mode:   SendRemainingValue,
            bounce: false,
            body: ReportStaticData{
                queryId:    msg.queryId,
                index:      self.index,
                collection: self.collection
            }.toCell()
        });
    }

    // TEP-62 getter
    get fun get_nft_data(): NftData {
        return NftData{
            init:       self.initialized,
            index:      self.index,
            collection: self.collection,
            owner:      self.owner,
            content:    self.content
        };
    }
}
