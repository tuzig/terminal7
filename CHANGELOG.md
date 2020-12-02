# ChangeLog

All notable changes to Terminal Seven - the touchable terminal multiplexer 
will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2020/12/2

### Added

- dividers that show border can move
- version information and link to the change log
- resending control messages on timeout 
- tactile fedback for lng press
- pane navigation keys

### Fixed

- Mutitasking resizing now works as expected
- replacing cordova with capacitor
- `npm run build` works 
- "remember host" label look
- notifications look
- complex layout resizing

## [0.9.3] - 2020/11/17

### Fixed

- Adding host with an existing name is forbidden
- Wrong message on bad host address
- Unchecking "remember host" is no longer ignored
- ctrl-c is working again

## [0.9.2] - 2020/11/15

### Added

- ⌘ is taking over as the leader. long press it to get the list of keys

### Fixed

- Copy mode had limited but complete functionality
- Like always, reconnect is a bit better should be working fine on single window


## [0.9.1] - 2020/11/08

### Added 

- Multitasking support

### Fixed

- Reconnecting after all panes closed is working

## [0.9.0] - 2020/11/04

### Added

- Edit host modal dialog that even lets you delete and reset
- Gracefully handle a stopped server

## [0.8.0] - 2020/10/28

### Fixed

- Removed "disconnected" modal popin when all is OK
- Reconnect now works!!!

### Added

- Adding indicators for network & host connectivity
- App Settings through a dotfile and the CodeMirror editor
- Token generation, storing and copying to server

## [0.7.1] - 2020/10/04

- Update the change log
- Fix resize
- Fix failed connection display

## [0.7.0] - 2020/10/04

### Added

- Support for webexec new api
- Saving and restoring entire layout
- Search

### Fixed 

- ?reconnect?


## [0.5.1] - 2020/07/29

### Added

- movable pane borders by using pan gesture

### Fixed

- Improved icon look & colors
- Thinner border for a cleaner look
- Evenly distributed icons on the navigation bars


## [0.3.2] - 2020/07/20

### Fixed

- Terminals are never to high and the last line is never clipped
- Tests are now loading index.html for more realistic env

## [0.3.1] - 2020/07/19

### Added

- Scaling pane using pinch gestures or "CTRL-A +" & "CTRL-A -"

### Fixed

- Fixing the buttons' font
- Hitting TAB nol longer moves to the next pane
- Fixing disconnect modal on zoomed pane

## [0.3.0] - 2020/07/08

### Added 

- App icons
- Host disconnected view with reconnect and shutdown buttons
- 2.5D design
- Message log

### Fixed

- Windows now close properly
- Display a message when connection attempt fails
- Home page gravitates to the bottom
- Add host gravitates to the bottom
- Handling of disconnection events
- Handling of unreachable hosts
- Tab key no longer focuses on the next element

## [0.2.0] - 2020/06/30

### Added

- Multi host: Adding support for multiple concurrent host connections
- Home page: Displaying the list of remembered hosts and a + button
- Authentication: An authentication control message is sent first
- Host list store & load: Using web's localSTorage
