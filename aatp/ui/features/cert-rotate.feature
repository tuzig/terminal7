Feature: Reconnecting after certificate rotation
  As a user I want my gates to reconnect after my security certificate
  was renewed and reauthorized with PeerBook

  Background:
    Given the terminal7 UI is loaded with one gate "foo" at "webexec"
    And the fingerprint is authorized on webexec
    And webexec is running on port 7777

  Scenario: Renewing the certificate keeps the gate connectable
    When I rotate the certificate
    Then a fresh certificate is generated only once
    When I connect to the first gate
    Then the active pane session should be "open"

  Scenario: Auto-renew without PeerBook connection never silently rotates
    When I close the PeerBook connection
    And my certificate is expiring soon
    Then a notification should match "subscribe renew"
    And the certificate was not regenerated
