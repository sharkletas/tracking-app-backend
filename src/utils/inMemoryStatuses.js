let inMemoryStatuses = {};

const setInMemoryStatuses = (statuses) => {
    inMemoryStatuses = statuses;
};

const getInMemoryStatuses = () => {
    if (Object.keys(inMemoryStatuses).length === 0) {
        throw new Error("inMemoryStatuses no está cargado todavía.");
    }
    return inMemoryStatuses;
};

module.exports = {
    setInMemoryStatuses,
    getInMemoryStatuses
};
