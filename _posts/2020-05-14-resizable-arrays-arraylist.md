---
tags: basics beginner
title: What are resizable arrays and an ArrayList?
---

In programming languages like Java arrays have fixed size. Means you cannot change the size of an array after its creation.

This is how you would initialize an array in Java:
```java
int[] integerArray = new int[10];
```

This will initiate an `integer` array of size 10, and since we provided the size of the array, it cannot hold more than 10 values.

For situations where we need to dynamically add new values to an array, this is a problem. That's where resizable arrays come.

Resizable arrays or ArrayList as they are called in Java, is an array like data-structure that offer dynamic resizing. We do not have to specify the size of this array, as it will automatically resize itself when new elements are added to it. How and when the resizing happens is dependent on the implementation in specific libraries/languages.

An example for this is:

```java
public ArrayList<Integer> createResizableArrayList(int[] evenNumbers, int[] oddNumbers){
    ArrayList<Integer> allNumbers = new ArrayList<>(); // Type definition can be skipped in the constructur because it is inferred from the declaration part
    for(int even: evenNumbers){
        allNumbers.add(even)
    }
    for(int odd: oddNumbers){
       allNumbers.add(odd)
    }

    return allNumbers;
}
```

In the above example `allNumbers` array will automatically resize itself to accommodate the values from both `evenNumbers` array and `oddNumbers` array.

<!--more-->

---
