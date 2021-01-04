/*********************************************************************/
/* function create_state belongs to https://github.com/DutchmanNL    */
/* Thanks for sharing!                                               */
/*********************************************************************/

const stateAttr = require(__dirname + '/stateAttr.js'); // Load attribute library
const stateExpire = {}, warnMessages = {};
const disableSentry = true; // Ensure to set to true during development !

async function TraverseJson(adapter, o, parent = null, replaceName = false, replaceID = false) {
    let id = null;
    let value = null;
    let name = null;

    for (var i in o) {
        name = i;
        if (!!o[i] && typeof (o[i]) == 'object' && o[i] == '[object Object]') {
            if (parent == null) {
                id = i;
                if (replaceName) {
                    if (o[i].name) name = o[i].name;
                }
                if (replaceID) {
                    if (o[i].id) id = o[i].id;
                }
            } else {
                id = parent + '.' + i;
                if (replaceName) {
                    if (o[i].name) name = o[i].name;
                }
                if (replaceID) {
                    if (o[i].id) id = parent + '.' + o[i].id;
                }
            }
            adapter.setObject(id, {
                'type': 'channel',
                'common': {
                    'name': name,
                },
                'native': {},
            });
            TraverseJson(adapter, o[i], id, replaceName, replaceID);
        } else {
            value = o[i];
            if (parent == null) {
                id = i;
            } else {
                id = parent + '.' + i
            }
            if (typeof (o[i]) == 'object') value = JSON.stringify(value);
            adapter.log.debug('create id ' + id + ' with value ' + value + ' and name ' + name);
            create_state(adapter, id, name, value);
        }
    }
}


async function create_state(adapter, stateName, name, value) {
    adapter.log.debug('Create_state called for : ' + stateName + ' with value : ' + value);
    adapter.config.apiRefreshInterval = 10;

    try {

        // Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
        const common = {};
        if (!stateAttr[name]) {
            const warnMessage = `State attribute definition missing for '${name}'`;
            if (warnMessages[name] !== warnMessage) {
                warnMessages[name] = warnMessage;
                // Send information to Sentry
                sendSentry(adapter, warnMessage);
            }
        }
        common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
        common.type = typeof (value);
        common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
        common.read = true;
        common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
        common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;
        if ((!adapter.createdStatesDetails[stateName])
            || (adapter.createdStatesDetails[stateName]
                && (
                    common.name !== adapter.createdStatesDetails[stateName].name
                    || common.name !== adapter.createdStatesDetails[stateName].name
                    || common.type !== adapter.createdStatesDetails[stateName].type
                    || common.role !== adapter.createdStatesDetails[stateName].role
                    || common.read !== adapter.createdStatesDetails[stateName].read
                    || common.unit !== adapter.createdStatesDetails[stateName].unit
                    || common.write !== adapter.createdStatesDetails[stateName].write
                )
            )) {

            // console.log(`An attribute has changed : ${state}`);
            await adapter.extendObjectAsync(stateName, {
                type: 'state',
                common
            });

        } else {
            // console.log(`Nothing changed do not update object`);
        }

        // Store current object definition to memory
        adapter.createdStatesDetails[stateName] = common;

        // Set value to state including expiration time
        if (value !== null || value !== undefined) {
            await adapter.setState(stateName, {
                val: value,
                ack: true,
                expire: adapter.executioninterval
            });
        }

        // Timer  to set online state to  FALSE when not updated during  2 time-sync intervals
        if (name === 'online') {
            // Clear running timer
            if (stateExpire[stateName]) {
                clearTimeout(stateExpire[stateName]);
                stateExpire[stateName] = null;
            }

            // timer
            stateExpire[stateName] = setTimeout(async () => {
                // Set value to state including expiration time
                await adapter.setState(stateName, {
                    val: false,
                    ack: true,
                });
                adapter.log.info('Online state expired for ' + stateName);
            }, adapter.executioninterval * 1000 + 5000);
            adapter.log.info('Expire time set for state : ' + name + ' with time in seconds : ' + (adapter.executioninterval+5));
        }

        // Subscribe on state changes if writable
        common.write && adapter.subscribeStates(stateName);

    } catch (error) {
        adapter.log.error('Create state error = ' + error);
    }
}

function sendSentry(adapter, msg) {

    if (!disableSentry) {
        adapter.log.info(`[Error catched and send to Sentry, thank you collaborating!] error: ${msg}`);
        if (adapter.supportsFeature && adapter.supportsFeature('PLUGINS')) {
            const sentryInstance = adapter.getPluginInstance('sentry');
            if (sentryInstance) {
                sentryInstance.getSentryObject().captureException(msg);
            }
        }
    }else {
        adapter.log.warn(`Sentry disabled, error catched : ${msg}`);
        console.error(`Sentry disabled, error catched : ${msg}`);
    }
}

module.exports = {
    TraverseJson: TraverseJson,
    create_state: create_state
};